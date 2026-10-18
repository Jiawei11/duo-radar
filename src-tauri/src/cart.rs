use crate::chromium_fetcher::{ChromiumSession, app_profile_dir};
use apw_core::model::{Product, Store};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

struct CartSession {
    completed: AtomicBool,
    session: Mutex<Option<ChromiumSession>>,
    profile: PathBuf,
}
impl Default for CartSession {
    fn default() -> Self {
        Self {
            completed: AtomicBool::new(false),
            session: Mutex::new(None),
            profile: app_profile_dir("cart-profile-v1"),
        }
    }
}

fn selection(product: &Product) -> Result<Value, String> {
    if !crate::duo::allowed(product) {
        return Err("不支持此型号".into());
    }
    let color = match product.color.as_str() {
        "Mist Blue" => "mistblue",
        "Star White" => "starwhite",
        "Night Sky" => "nightsky",
        _ => return Err("无法确认商品颜色".into()),
    };
    Ok(
        json!({"part":product.part_number,"title":product.title,"color":color,"capacity":product.capacity.to_lowercase()}),
    )
}

pub(crate) struct CartRunner {
    sessions: Mutex<HashMap<String, Arc<CartSession>>>,
    profile: PathBuf,
}
impl Default for CartRunner {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            profile: app_profile_dir("manual-cart-v3"),
        }
    }
}
impl CartRunner {
    pub(crate) async fn prepare(&self, product: &Product, store: &Store) -> Result<String, String> {
        let zip = store.postal_code.split('-').next().unwrap_or("");
        if zip.len() != 5 || !zip.bytes().all(|c| c.is_ascii_digit()) {
            return Err("该门店缺少有效美国 ZIP，无法自动搜索取货地点。".into());
        }
        selection(product)?;
        let key = format!("{}-{}", store.number, product.part_number.replace('/', "-"));
        let session = self
            .sessions
            .lock()
            .await
            .entry(key.clone())
            .or_insert_with(|| {
                Arc::new(CartSession {
                    profile: self.profile.join(key),
                    ..Default::default()
                })
            })
            .clone();
        session.prepare(product, zip).await
    }
}
impl CartSession {
    async fn prepare(&self, product: &Product, zip: &str) -> Result<String, String> {
        let expected = selection(product)?;
        let mut guard = self
            .session
            .try_lock()
            .map_err(|_| "已有加购操作进行中，请稍后查看浏览器。")?;
        let needs_start = match guard.as_mut() {
            Some(browser) => browser.evaluate("1", false).await.is_err(),
            None => true,
        };
        if needs_start {
            self.completed.store(false, Ordering::SeqCst);
            *guard = Some(
                ChromiumSession::start_visible(self.profile.clone())
                    .await
                    .map_err(|e| e.to_string())?,
            );
        }
        let browser = guard.as_mut().unwrap();
        if self.completed.load(Ordering::SeqCst) {
            browser
                .command("Page.bringToFront", json!({}))
                .await
                .map_err(|e| e.to_string())?;
            return Ok(format!(
                "已重新打开该条取货页面（ZIP {zip}），后续请手动操作。"
            ));
        }
        #[cfg(test)]
        eprintln!("cart browser connected");
        browser
            .command("Page.bringToFront", json!({}))
            .await
            .map_err(|e| e.to_string())?;
        browser
            .command(
                "Page.navigate",
                json!({"url":"https://www.apple.com/shop/bag"}),
            )
            .await
            .map_err(|e| e.to_string())?;
        #[cfg(test)]
        eprintln!("cart bag navigation sent");
        let deadline = Instant::now() + Duration::from_secs(90);
        let mut on_product = false;
        let mut added = false;
        let mut added_at = None;
        let mut rechecked_bag = false;
        while Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(650)).await;
            let source = include_str!("cart.js");
            let script = format!("({})({}, {})", source, expected, on_product && !added);
            let result = match browser.evaluate(&script, false).await {
                Ok(result) => result,
                // A click can navigate before CDP returns. Never click Add a second time.
                Err(error) => {
                    return Err(format!(
                        "加购页面状态无法确认，请检查已打开的浏览器：{error}"
                    ));
                }
            };
            match result["state"].as_str().unwrap_or("wait") {
                "ready" => {
                    Self::pickup(browser, zip).await?;
                    self.completed.store(true, Ordering::SeqCst);
                    return Ok(format!(
                        "{} × 1；已选择取货并应用 ZIP {zip}，请自行选择门店并继续。",
                        product.title
                    ));
                }
                "conflict" => {
                    return Err(result["detail"]
                        .as_str()
                        .unwrap_or("购物袋需要手动检查")
                        .into());
                }
                "empty" if !on_product => {
                    on_product = true;
                    let url = format!("https://www.apple.com/shop/product/{}", product.part_number);
                    browser
                        .command("Page.navigate", json!({"url":url}))
                        .await
                        .map_err(|e| e.to_string())?;
                }
                "added" => {
                    added = true;
                    added_at = Some(Instant::now());
                }
                "empty" if added => return Err("Apple 未在购物袋中确认该商品，请手动检查。".into()),
                _ => {}
            }
            // Apple sometimes redirects to an accessory/product variant without Review Bag.
            // Verify the bag once; never submit Add again when its result is uncertain.
            if added
                && !rechecked_bag
                && added_at.is_some_and(|at| at.elapsed() > Duration::from_secs(8))
            {
                rechecked_bag = true;
                browser
                    .command(
                        "Page.navigate",
                        json!({"url":"https://www.apple.com/shop/bag"}),
                    )
                    .await
                    .map_err(|e| e.to_string())?;
            }
            #[cfg(test)]
            eprintln!("cart step: {result}");
        }
        Err(
            "等待 Apple 页面超时。浏览器已保留，请检查商品选项或访问验证后重试；未确认加购成功。"
                .into(),
        )
    }
    async fn pickup(browser: &mut ChromiumSession, zip: &str) -> Result<(), String> {
        let deadline = Instant::now() + Duration::from_secs(100);
        while Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(700)).await;
            let source = include_str!("cart_pickup.js");
            let result = browser
                .evaluate(&format!("({})({})", source, json!(zip)), false)
                .await
                .map_err(|e| format!("取货页面状态无法确认，请手动继续：{e}"))?;
            #[cfg(test)]
            eprintln!("pickup step: {result}");
            if result["state"] == "ready" {
                return Ok(());
            }
        }
        Err("已打开 Apple 页面，但未能确认取货 ZIP 搜索完成，请在浏览器手动继续。".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "Adds one iPhone 17 and opens guest pickup ZIP results; never orders"]
    async fn live_us_cart_and_repeat() {
        let product = apw_core::catalog::Catalog::new()
            .product_by_part("en_US", "MG484LL/A")
            .unwrap();
        let store = apw_core::catalog::Catalog::new()
            .stores("en_US")
            .unwrap()
            .into_iter()
            .find(|s| s.number == "R144")
            .unwrap();
        let profile = tempfile::tempdir().unwrap();
        let runner = CartRunner {
            profile: profile.path().to_path_buf(),
            ..Default::default()
        };
        println!(
            "{}",
            runner
                .prepare(&product, &store)
                .await
                .expect("first add verified")
        );
        println!(
            "{}",
            runner
                .prepare(&product, &store)
                .await
                .expect("repeat reuses quantity one")
        );
        let second_store = apw_core::catalog::Catalog::new()
            .stores("en_US")
            .unwrap()
            .into_iter()
            .find(|s| s.number == "R095")
            .unwrap();
        println!(
            "{}",
            runner
                .prepare(&product, &second_store)
                .await
                .expect("second monitor has independent cart and ZIP")
        );
        let sessions = runner.sessions.lock().await;
        assert_eq!(sessions.len(), 2);
        for (store, zip) in [("R144", "75225"), ("R095", "10153")] {
            let session = sessions.get(&format!("{store}-MG484LL-A")).unwrap();
            let mut guard = session.session.lock().await;
            let result=guard.as_mut().unwrap().evaluate("({zip:window.__duoPickup.zip,applied:window.__duoPickup.applied,stores:[...document.querySelectorAll('input[name=\"store-locator-result\"]')].map(el=>el.value)})",false).await.unwrap();
            println!("verified {store}: {result}");
            assert_eq!(result["zip"], zip);
            assert_eq!(result["applied"], true);
            assert!(
                result["stores"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|value| value == store)
            );
        }
    }
}
