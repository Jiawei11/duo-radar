//! User-imported HTTP proxies. Secrets stay out of logs, command lines and Git.
//! Windows persistence uses user-scoped DPAPI; TLS is tunnelled, never intercepted.
use crate::chromium_fetcher::AppleChromiumFetcher;
use apw_core::{
    apple::{ApiError, StoreAvailability},
    config::SettingsStore,
    model::{DeliveryRegion, Region, Target},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, Ordering};
use std::{
    collections::VecDeque,
    io::Write,
    path::PathBuf,
    sync::{Arc, OnceLock},
    time::{Duration, Instant},
};
static REQUESTS: AtomicU32 = AtomicU32::new(0);
pub(crate) fn begin_cycle() {
    REQUESTS.store(0, Ordering::Relaxed);
}
pub(crate) fn cycle_stats() -> apw_core::apple::CycleStats {
    apw_core::apple::CycleStats {
        request_count: REQUESTS.load(Ordering::Relaxed),
        reused_response_count: 0,
        route: Some("Proxy round robin".into()),
    }
}
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::{Mutex, Semaphore},
    task::{JoinHandle, JoinSet},
};

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct ProxyEntry {
    pub id: u64,
    pub ip: String,
    pub port: u16,
    pub user: String,
    pub password: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
pub(crate) struct ProxyConfig {
    pub enabled: bool,
    pub entries: Vec<ProxyEntry>,
}
static CONFIG: OnceLock<Mutex<Result<ProxyConfig, String>>> = OnceLock::new();
fn config() -> &'static Mutex<Result<ProxyConfig, String>> {
    CONFIG.get_or_init(|| {
        Mutex::new(if cfg!(test) {
            Ok(ProxyConfig::default())
        } else {
            load()
        })
    })
}
fn path() -> Result<PathBuf, String> {
    SettingsStore::new()
        .map(|s| s.path().with_file_name("proxies.v1.bin"))
        .map_err(|_| "Cannot locate proxy settings".into())
}

#[cfg(windows)]
fn protect(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    unsafe {
        let ok = if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err("Cannot encrypt/decrypt proxy settings for this Windows account".into());
        }
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData as _);
        Ok(result)
    }
}
#[cfg(not(windows))]
fn protect(bytes: &[u8], _: bool) -> Result<Vec<u8>, String> {
    Ok(bytes.to_vec())
}
fn load() -> Result<ProxyConfig, String> {
    let p = path()?;
    if !p.exists() {
        return Ok(ProxyConfig::default());
    }
    if std::fs::metadata(&p)
        .map_err(|_| "Cannot read proxy settings")?
        .len()
        > 1_000_000
    {
        return Err("Proxy settings exceed size limit".into());
    }
    let bytes = std::fs::read(p).map_err(|_| "Cannot read proxy settings")?;
    serde_json::from_slice(&protect(&bytes, false)?).map_err(|_| "Invalid proxy settings".into())
}
fn save(c: &ProxyConfig) -> Result<(), String> {
    let p = path()?;
    let dir = p.parent().ok_or("Cannot locate settings folder")?;
    std::fs::create_dir_all(dir).map_err(|_| "Cannot create settings folder")?;
    let bytes = protect(
        &serde_json::to_vec(c).map_err(|_| "Cannot encode proxies")?,
        true,
    )?;
    let mut temp = tempfile::NamedTempFile::new_in(dir).map_err(|_| "Cannot save proxies")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        temp.as_file()
            .set_permissions(std::fs::Permissions::from_mode(0o600))
            .map_err(|_| "Cannot secure proxies")?;
    }
    temp.write_all(&bytes)
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|_| "Cannot save proxies")?;
    temp.persist(p)
        .map_err(|_| "Cannot replace proxy settings")?;
    Ok(())
}
pub(crate) fn parse(text: &str, existing: &[ProxyEntry]) -> Result<Vec<ProxyEntry>, String> {
    if text.len() > 500_000 {
        return Err("Import exceeds size limit".into());
    }
    let mut result = existing.to_vec();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "System clock is invalid")?
        .as_millis() as u64;
    let mut id = result
        .iter()
        .map(|e| e.id)
        .max()
        .unwrap_or(0)
        .max(timestamp)
        + 1;
    for (line_number, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let fields: Vec<_> = line.splitn(4, ':').collect();
        let fail = || format!("Line {}: expected IP:PORT:USER:PASSWORD", line_number + 1);
        if fields.len() != 4
            || fields
                .iter()
                .any(|f| f.is_empty() || f.chars().any(char::is_control))
        {
            return Err(fail());
        }
        let ip: std::net::Ipv4Addr = fields[0].parse().map_err(|_| fail())?;
        let port: u16 = fields[1].parse().map_err(|_| fail())?;
        if port == 0 {
            return Err(fail());
        }
        let entry = ProxyEntry {
            id,
            ip: ip.to_string(),
            port,
            user: fields[2].into(),
            password: fields[3].into(),
        };
        if !result.iter().any(|e| {
            e.ip == entry.ip
                && e.port == entry.port
                && e.user == entry.user
                && e.password == entry.password
        }) {
            result.push(entry);
            id += 1;
        }
        if result.len() > 250 {
            return Err("Maximum 250 proxies".into());
        }
    }
    if result.len() == existing.len() {
        return Err("No new proxies (empty input or duplicates)".into());
    }
    Ok(result)
}
#[tauri::command]
pub(crate) async fn proxy_settings() -> Result<ProxyConfig, String> {
    config().lock().await.clone()
}
#[tauri::command]
pub(crate) async fn proxy_import(text: String) -> Result<ProxyConfig, String> {
    let mut guard = config().lock().await;
    let mut next = guard.as_ref().map_err(Clone::clone)?.clone();
    next.entries = parse(&text, &next.entries)?;
    save(&next)?;
    *guard = Ok(next.clone());
    Ok(next)
}
#[tauri::command]
pub(crate) async fn proxy_enable(enabled: bool) -> Result<ProxyConfig, String> {
    let mut guard = config().lock().await;
    let mut next = guard.as_ref().map_err(Clone::clone)?.clone();
    if enabled && next.entries.is_empty() {
        return Err("Import at least one proxy first".into());
    }
    next.enabled = enabled;
    save(&next)?;
    *guard = Ok(next.clone());
    drop(guard);
    // Do not block the UI on an in-flight query; it finishes on its original route.
    if !enabled {
        tokio::spawn(async {
            runtime()
                .lock()
                .await
                .workers
                .retain(|w| Arc::strong_count(w) > 1);
        });
    }
    Ok(next)
}
#[tauri::command]
pub(crate) async fn proxy_remove(id: u64) -> Result<ProxyConfig, String> {
    let mut guard = config().lock().await;
    let mut next = guard.as_ref().map_err(Clone::clone)?.clone();
    next.entries.retain(|e| e.id != id);
    if next.entries.is_empty() {
        next.enabled = false;
    }
    save(&next)?;
    *guard = Ok(next.clone());
    drop(guard);
    tokio::spawn(async move {
        runtime()
            .lock()
            .await
            .workers
            .retain(|w| w.entry.id != id || Arc::strong_count(w) > 1);
    });
    Ok(next)
}

// The pool lock only reserves sessions. Network I/O holds a per-proxy lock,
// so separate proxies run concurrently while the same profile is never used twice.
const MAX_RESIDENT_PROXIES: usize = 32;
struct Worker {
    entry: ProxyEntry,
    fetcher: AppleChromiumFetcher,
    _relay: Relay,
    batch: Mutex<()>,
}
#[derive(Default)]
struct Runtime {
    cursor: usize,
    workers: VecDeque<Arc<Worker>>,
}
impl Runtime {
    async fn acquire(&mut self, entry: ProxyEntry) -> Result<Arc<Worker>, ApiError> {
        let worker = if let Some(pos) = self.workers.iter().position(|w| w.entry == entry) {
            self.workers.remove(pos).unwrap()
        } else {
            // Do not evict a leased worker: that would allow a second browser to open its profile.
            if self.workers.len() >= MAX_RESIDENT_PROXIES {
                if let Some(pos) = self.workers.iter().position(|w| Arc::strong_count(w) == 1) {
                    self.workers.remove(pos);
                }
            }
            let relay = Relay::start(entry.clone())
                .await
                .map_err(ApiError::Transport)?;
            let profile = path()
                .map_err(ApiError::Transport)?
                .with_file_name(format!("proxy-browser-{}", entry.id));
            Arc::new(Worker {
                entry,
                fetcher: AppleChromiumFetcher::with_proxy(profile, relay.port),
                _relay: relay,
                batch: Mutex::new(()),
            })
        };
        self.workers.push_back(worker.clone());
        Ok(worker)
    }
}
fn next_index(cursor: &mut usize, count: usize) -> usize {
    let index = *cursor % count;
    *cursor = cursor.wrapping_add(1);
    index
}
static RUNTIME: OnceLock<Mutex<Runtime>> = OnceLock::new();
fn runtime() -> &'static Mutex<Runtime> {
    RUNTIME.get_or_init(|| Mutex::new(Runtime::default()))
}
pub(crate) async fn active() -> bool {
    config()
        .lock()
        .await
        .as_ref()
        .map(|c| c.enabled)
        .unwrap_or(true)
}
pub(crate) async fn shutdown() {
    runtime().lock().await.workers.clear();
}
pub(crate) async fn pickup(
    region: &'static Region,
    store: &str,
    targets: &[Target],
    delivery: Option<&DeliveryRegion>,
) -> Result<StoreAvailability, ApiError> {
    let worker = {
        let mut rt = runtime().lock().await;
        let c = config().lock().await.clone().map_err(ApiError::Transport)?;
        if !c.enabled {
            return Err(ApiError::Transport(
                "Proxy mode changed; next cycle uses the current setting".into(),
            ));
        }
        if c.entries.is_empty() {
            return Err(ApiError::Transport("No proxies configured".into()));
        }
        let entry = c.entries[next_index(&mut rt.cursor, c.entries.len())].clone();
        rt.acquire(entry).await?
    }; // Release the pool lock before browser startup, warm-up and HTTP requests.
    let _batch = worker.batch.lock().await;
    worker.fetcher.reset_proxy_batch().await;
    let result = worker
        .fetcher
        .pickup(region, store, targets, delivery)
        .await;
    REQUESTS.fetch_add(
        worker.fetcher.proxy_request_count().await,
        Ordering::Relaxed,
    );
    result
}

struct Relay {
    port: u16,
    task: JoinHandle<()>,
}
impl Drop for Relay {
    fn drop(&mut self) {
        self.task.abort();
    }
}
impl Relay {
    async fn start(entry: ProxyEntry) -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|_| "Cannot open local proxy relay")?;
        let port = listener
            .local_addr()
            .map_err(|_| "Cannot read relay port")?
            .port();
        let task = tokio::spawn(async move {
            let mut connections = JoinSet::new();
            loop {
                tokio::select! {
                    result=listener.accept()=> {let Ok((socket,_))=result else {break}; if connections.len()<64 {let e=entry.clone();connections.spawn(async move { let _=tokio::time::timeout(Duration::from_secs(300),tunnel(socket,e)).await; });}}
                    _=connections.join_next(), if !connections.is_empty()=>{}
                }
            }
        });
        Ok(Self { port, task })
    }
}
async fn header(stream: &mut TcpStream) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    // Do not consume TLS bytes after CONNECT's headers.
    while bytes.len() < 16384 {
        let b = stream.read_u8().await?;
        bytes.push(b);
        if bytes.ends_with(b"\r\n\r\n") {
            return Ok(bytes);
        }
    }
    Err(std::io::Error::other("Proxy header too large"))
}
async fn tunnel(mut downstream: TcpStream, entry: ProxyEntry) -> std::io::Result<()> {
    let setup = async {
        let request = header(&mut downstream).await?;
        let line = std::str::from_utf8(&request)
            .map_err(|_| std::io::Error::other("Invalid proxy request"))?
            .lines()
            .next()
            .unwrap_or("");
        let fields: Vec<_> = line.split_whitespace().collect();
        if fields.len() != 3
            || fields[0] != "CONNECT"
            || !fields[1].ends_with(":443")
            || fields[1].contains('@')
        {
            return Err(std::io::Error::other("HTTPS CONNECT required"));
        }
        let mut upstream = TcpStream::connect((entry.ip.as_str(), entry.port)).await?;
        let auth = STANDARD.encode(format!("{}:{}", entry.user, entry.password));
        upstream
            .write_all(
                format!(
                    "CONNECT {} HTTP/1.1\r\nHost: {}\r\nProxy-Authorization: Basic {}\r\n\r\n",
                    fields[1], fields[1], auth
                )
                .as_bytes(),
            )
            .await?;
        let response = header(&mut upstream).await?;
        let status = String::from_utf8_lossy(&response)
            .split_whitespace()
            .nth(1)
            .unwrap_or("")
            .to_owned();
        if status != "200" {
            downstream
                .write_all(if status == "407" {
                    b"HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n"
                } else {
                    b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n"
                })
                .await?;
            return Err(std::io::Error::other("Upstream proxy rejected tunnel"));
        }
        downstream
            .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            .await?;
        Ok(upstream)
    };
    let mut upstream = tokio::time::timeout(Duration::from_secs(20), setup)
        .await
        .map_err(|_| std::io::Error::other("Proxy timeout"))??;
    tokio::io::copy_bidirectional(&mut downstream, &mut upstream).await?;
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TestResult {
    id: u64,
    ok: bool,
    latency_ms: Option<u64>,
    status: Option<u16>,
    message: String,
}
static TEST_SLOTS: OnceLock<Semaphore> = OnceLock::new();
#[tauri::command]
pub(crate) async fn proxy_test(id: u64) -> Result<TestResult, String> {
    let entry = config()
        .lock()
        .await
        .as_ref()
        .map_err(Clone::clone)?
        .entries
        .iter()
        .find(|e| e.id == id)
        .cloned()
        .ok_or("Proxy no longer exists")?;
    let _slot = TEST_SLOTS
        .get_or_init(|| Semaphore::new(3))
        .acquire()
        .await
        .map_err(|_| "Test queue closed")?;
    let start = Instant::now();
    let run = async {
        let relay = Relay::start(entry).await?;
        let proxy = reqwest::Proxy::all(format!("http://127.0.0.1:{}", relay.port))
            .map_err(|_| "Cannot configure test proxy")?;
        let client = reqwest::Client::builder()
            .no_proxy()
            .proxy(proxy)
            .timeout(Duration::from_secs(25))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .map_err(|_| "Cannot create test client")?;
        let response = client
            .get("https://www.apple.com/shop")
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    "Connection timed out"
                } else {
                    "Proxy connection, authentication or TLS failed"
                }
            })?;
        Ok::<_, String>(response.status().as_u16())
    };
    Ok(match run.await {
        Ok(status) => TestResult {
            id,
            ok: (200..300).contains(&status),
            latency_ms: Some(start.elapsed().as_millis() as u64),
            status: Some(status),
            message: format!("HTTP {status}"),
        },
        Err(message) => TestResult {
            id,
            ok: false,
            latency_ms: None,
            status: None,
            message,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn all_twenty_five_sessions_are_reused_and_have_independent_locks() {
        let mut pool = Runtime::default();
        let mut originals = Vec::new();
        for id in 1..=25 {
            let entry = ProxyEntry {
                id,
                ip: "127.0.0.1".into(),
                port: 9,
                user: "test".into(),
                password: "test".into(),
            };
            originals.push(pool.acquire(entry).await.unwrap());
        }
        for original in &originals {
            let again = pool.acquire(original.entry.clone()).await.unwrap();
            assert!(
                Arc::ptr_eq(original, &again),
                "A full proxy rotation must reuse the same session"
            );
        }
        assert_eq!(pool.workers.len(), 25);
        let _first = originals[0].batch.lock().await;
        assert!(
            tokio::time::timeout(Duration::from_millis(100), originals[1].batch.lock())
                .await
                .is_ok(),
            "Another proxy must not wait on the first proxy's query"
        );
        assert!(
            originals[0].batch.try_lock().is_err(),
            "One proxy/profile must remain serialized"
        );
    }
    #[tokio::test]
    #[ignore = "Starts installed Chromium against a local fake proxy; no upstream connection"]
    async fn chromium_inventory_reaches_authenticated_proxy() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (tx, rx) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            let mut tx = Some(tx);
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    break;
                };
                let Ok(bytes) = header(&mut socket).await else {
                    continue;
                };
                let request = String::from_utf8(bytes).unwrap();
                if request.starts_with("CONNECT www.apple.com:443 ") {
                    if let Some(tx) = tx.take() {
                        let _ = tx.send(request);
                    }
                }
                let _ = socket
                    .write_all(
                        b"HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n",
                    )
                    .await;
            }
        });
        let relay = Relay::start(ProxyEntry {
            id: 3,
            ip: "127.0.0.1".into(),
            port,
            user: "user".into(),
            password: "pass".into(),
        })
        .await
        .unwrap();
        let directory = tempfile::tempdir().unwrap();
        let fetcher = AppleChromiumFetcher::with_proxy(directory.path().to_owned(), relay.port);
        let running = fetcher.clone();
        let query = tokio::spawn(async move {
            let target = Target {
                locale: "en_US".into(),
                store_number: "R144".into(),
                store_title: "NorthPark".into(),
                part_number: "MG484LL/A".into(),
                product_name: "iPhone 17".into(),
                companion_part: None,
                companion_name: None,
                kit_part: None,
                pickup_location: None,
            };
            running
                .pickup(
                    apw_core::model::region_by_locale("en_US").unwrap(),
                    "R144",
                    &[target],
                    None,
                )
                .await
        });
        let observed = tokio::time::timeout(Duration::from_secs(30), rx).await;
        query.abort();
        let _ = query.await;
        fetcher.shutdown().await;
        server.abort();
        let request = observed
            .expect("Chromium did not route Apple through the local proxy")
            .unwrap();
        assert!(request.contains("Proxy-Authorization: Basic dXNlcjpwYXNz\r\n"));
    }
    #[test]
    fn rotation_covers_all_proxies_across_cycles_and_after_removal() {
        let mut cursor = 0;
        let indices: Vec<_> = (0..75).map(|_| next_index(&mut cursor, 25)).collect();
        for pass in indices.chunks(25) {
            assert_eq!(pass, (0..25).collect::<Vec<_>>());
        }
        assert_eq!(next_index(&mut cursor, 24), 3);
        assert_eq!(next_index(&mut cursor, 1), 0);
    }
    #[test]
    fn import_validation_and_deduplication() {
        let v = parse(
            "127.0.0.1:3120:user:pass:with:colons\r\n\r\n127.0.0.2:80:u:p",
            &[],
        )
        .unwrap();
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].password, "pass:with:colons");
        assert!(parse("127.0.0.1:3120:user:pass:with:colons", &v).is_err());
        for s in [
            "bad:3120:u:secret",
            "127.0.0.1:0:u:secret",
            "127.0.0.1:80::secret",
            "127.0.0.1:80:u:secret\t",
        ] {
            let err = parse(s, &[]);
            if !s.ends_with('\t') {
                assert!(err.is_err());
                assert!(!err.err().unwrap().contains("secret"));
            }
        }
    }
    #[test]
    fn encryption_roundtrip() {
        let plain = b"synthetic-proxy-secret";
        let blob = protect(plain, true).unwrap();
        #[cfg(windows)]
        assert_ne!(blob, plain);
        assert_eq!(protect(&blob, false).unwrap(), plain);
    }
    #[tokio::test]
    async fn relay_preserves_auth_failure_without_forwarding_secrets() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let _ = header(&mut socket).await.unwrap();
            socket.write_all(b"HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=private\r\n\r\n").await.unwrap();
        });
        let relay = Relay::start(ProxyEntry {
            id: 2,
            ip: "127.0.0.1".into(),
            port,
            user: "sensitive-user".into(),
            password: "sensitive-password".into(),
        })
        .await
        .unwrap();
        let mut client = TcpStream::connect(("127.0.0.1", relay.port)).await.unwrap();
        client
            .write_all(b"CONNECT www.apple.com:443 HTTP/1.1\r\n\r\n")
            .await
            .unwrap();
        let result = String::from_utf8(header(&mut client).await.unwrap()).unwrap();
        assert!(result.contains("407"));
        assert!(!result.contains("sensitive"));
        assert!(!result.contains("private"));
        server.await.unwrap();
    }
    #[tokio::test]
    async fn relay_authenticates_and_preserves_tunnel_bytes() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (mut s, _) = listener.accept().await.unwrap();
            let h = String::from_utf8(header(&mut s).await.unwrap()).unwrap();
            assert!(h.contains("Proxy-Authorization: Basic dXNlcjpwYXNz\r\n"));
            assert!(h.starts_with("CONNECT www.apple.com:443 HTTP/1.1"));
            s.write_all(b"HTTP/1.1 200 OK\r\n\r\nhello").await.unwrap();
            let mut b = [0; 4];
            s.read_exact(&mut b).await.unwrap();
            assert_eq!(&b, b"ping");
        });
        let relay = Relay::start(ProxyEntry {
            id: 1,
            ip: "127.0.0.1".into(),
            port,
            user: "user".into(),
            password: "pass".into(),
        })
        .await
        .unwrap();
        let mut client = TcpStream::connect(("127.0.0.1", relay.port)).await.unwrap();
        client
            .write_all(b"CONNECT www.apple.com:443 HTTP/1.1\r\nHost: www.apple.com\r\n\r\n")
            .await
            .unwrap();
        assert!(
            String::from_utf8(header(&mut client).await.unwrap())
                .unwrap()
                .contains("200")
        );
        let mut hello = [0; 5];
        client.read_exact(&mut hello).await.unwrap();
        assert_eq!(&hello, b"hello");
        client.write_all(b"ping").await.unwrap();
        server.await.unwrap();
    }
}
