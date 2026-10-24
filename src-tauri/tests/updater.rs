use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tauri_plugin_updater::UpdaterExt;

struct Feed {
    url: String,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl Feed {
    fn new(version: &str, signature: &str, bytes: Vec<u8>, status: u16) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let manifest = serde_json::json!({"version":version,"notes":"Local update test","platforms":{"windows-x86_64":{"url":format!("{url}/package.exe"),"signature":signature.trim()}}}).to_string();
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let thread = std::thread::spawn(move || {
            while !flag.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        stream.set_nonblocking(false).unwrap();
                        stream
                            .set_read_timeout(Some(Duration::from_secs(2)))
                            .unwrap();
                        let mut request = Vec::new();
                        while !request.ends_with(b"\r\n\r\n") && request.len() < 8192 {
                            let mut byte = [0];
                            if stream.read(&mut byte).unwrap_or(0) == 0 {
                                break;
                            }
                            request.push(byte[0]);
                        }
                        let request = String::from_utf8_lossy(&request);
                        let body = if request.starts_with("GET /package.exe ") {
                            bytes.as_slice()
                        } else {
                            manifest.as_bytes()
                        };
                        let _ = write!(
                            stream,
                            "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            body.len()
                        );
                        let _ = stream.write_all(body);
                    }
                    Err(_) => std::thread::sleep(Duration::from_millis(5)),
                }
            }
        });
        Self {
            url,
            stop,
            thread: Some(thread),
        }
    }
}
impl Drop for Feed {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        self.thread.take().unwrap().join().unwrap();
    }
}

fn app(pubkey: &str) -> tauri::App<tauri::test::MockRuntime> {
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.package_info_mut().version = "1.4.3".parse().unwrap();
    context.config_mut().plugins.0.insert(
        "updater".into(),
        serde_json::json!({"pubkey":pubkey.trim(),"dangerousInsecureTransportProtocol":true}),
    );
    tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap()
}

#[tokio::test]
async fn signed_download_and_version_checks() {
    let app = app(include_str!("fixtures/update.pub"));
    for version in ["1.4.2", "1.4.3", "1.4.4"] {
        let bytes = include_bytes!("fixtures/update.txt").to_vec();
        let feed = Feed::new(
            version,
            include_str!("fixtures/update.txt.sig"),
            bytes.clone(),
            200,
        );
        let updater = app
            .updater_builder()
            .target("windows-x86_64")
            .endpoints(vec![feed.url.parse().unwrap()])
            .unwrap()
            .no_proxy()
            .build()
            .unwrap();
        let update = updater.check().await.unwrap();
        if version != "1.4.4" {
            assert!(update.is_none());
            continue;
        }
        let mut count = 0;
        let data = update
            .unwrap()
            .download(|n, _| count += n, || {})
            .await
            .unwrap();
        assert_eq!(count, bytes.len());
        assert_eq!(data, bytes);
    }
}

#[tokio::test]
async fn corrupt_package_and_failed_endpoint_are_rejected() {
    let app = app(include_str!("fixtures/update.pub"));
    let feed = Feed::new(
        "1.4.4",
        include_str!("fixtures/update.txt.sig"),
        b"tampered".to_vec(),
        200,
    );
    let updater = app
        .updater_builder()
        .target("windows-x86_64")
        .endpoints(vec![feed.url.parse().unwrap()])
        .unwrap()
        .no_proxy()
        .build()
        .unwrap();
    assert!(
        updater
            .check()
            .await
            .unwrap()
            .unwrap()
            .download(|_, _| {}, || {})
            .await
            .is_err()
    );
    let feed = Feed::new("1.4.4", "", vec![], 503);
    assert!(
        app.updater_builder()
            .endpoints(vec![feed.url.parse().unwrap()])
            .unwrap()
            .no_proxy()
            .build()
            .unwrap()
            .check()
            .await
            .is_err()
    );
}

#[tokio::test]
#[ignore = "requires a locally built signed NSIS package; does not install it"]
async fn actual_windows_package_signature() {
    let path = std::env::var("DUO_TEST_UPDATE_PACKAGE").expect("set DUO_TEST_UPDATE_PACKAGE");
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let app = app(config["plugins"]["updater"]["pubkey"].as_str().unwrap());
    let bytes = std::fs::read(&path).unwrap();
    let signature = std::fs::read_to_string(format!("{path}.sig")).unwrap();
    let feed = Feed::new("1.4.4", &signature, bytes.clone(), 200);
    let update = app
        .updater_builder()
        .target("windows-x86_64")
        .endpoints(vec![feed.url.parse().unwrap()])
        .unwrap()
        .no_proxy()
        .build()
        .unwrap()
        .check()
        .await
        .unwrap()
        .unwrap();
    assert_eq!(update.download(|_, _| {}, || {}).await.unwrap(), bytes);
}

#[tokio::test]
#[ignore = "downloads the published GitHub update and compares it to the local signed installer"]
async fn published_release_feed() {
    let path = std::env::var("DUO_TEST_UPDATE_PACKAGE").expect("set DUO_TEST_UPDATE_PACKAGE");
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let app = app(config["plugins"]["updater"]["pubkey"].as_str().unwrap());
    let endpoint = config["plugins"]["updater"]["endpoints"][0].as_str().unwrap();
    let update = app.updater_builder().target("windows-x86_64")
        .endpoints(vec![endpoint.parse().unwrap()]).unwrap()
        .timeout(Duration::from_secs(90)).build().unwrap().check().await.unwrap().unwrap();
    assert_eq!(update.version, env!("CARGO_PKG_VERSION"));
    assert_eq!(update.download(|_, _| {}, || {}).await.unwrap(), std::fs::read(path).unwrap());
}

// Run in its own process: Windows updater exits after invoking the installer.
// Use only the inert installer fixture, which writes a marker and installs nothing.
#[tokio::test]
#[ignore = "isolated process test; requires signed inert installer fixture and marker path"]
async fn windows_installer_handoff() {
    let path = std::env::var("DUO_TEST_INERT_INSTALLER").unwrap();
    assert!(std::env::var("DUO_TEST_INSTALL_MARKER").is_ok());
    let app = app(include_str!("fixtures/update.pub"));
    let bytes = std::fs::read(&path).unwrap();
    let signature = std::fs::read_to_string(format!("{path}.sig")).unwrap();
    let feed = Feed::new("1.4.4", &signature, bytes, 200);
    let update = app
        .updater_builder()
        .target("windows-x86_64")
        .on_before_exit(|| {})
        .endpoints(vec![feed.url.parse().unwrap()])
        .unwrap()
        .no_proxy()
        .build()
        .unwrap()
        .check()
        .await
        .unwrap()
        .unwrap();
    let bytes = update.download(|_, _| {}, || {}).await.unwrap();
    update.install(bytes).unwrap();
    panic!("Windows updater should exit after invoking the installer");
}
