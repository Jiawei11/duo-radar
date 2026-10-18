use crate::chromium_fetcher::{ChromiumSession, app_profile_dir};
use apw_core::model::Product;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

pub(crate) struct CartRunner {
    session: Mutex<Option<ChromiumSession>>,
    profile: PathBuf,
}
impl Default for CartRunner {
    fn default() -> Self {
        Self {
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

impl CartRunner {
    pub(crate) async fn prepare(&self, product: &Product) -> Result<String, String> {
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
            *guard = Some(
                ChromiumSession::start_visible(self.profile.clone())
                    .await
                    .map_err(|e| e.to_string())?,
            );
        }
        let browser = guard.as_mut().unwrap();
        if browser
            .evaluate("location.pathname.includes('/checkout')", false)
            .await
            .map_err(|e| e.to_string())?
            .as_bool()
            == Some(true)
        {
            return Err("购物袋正在结账，请先手动完成或退出结账；本次未跳转或加购。".into());
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
                    return Ok(format!(
                        "购物袋已确认：{} × 1；请在 Apple 页面自行确认取货门店。",
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
                "added" => added = true,
                "empty" if added => return Err("Apple 未在购物袋中确认该商品，请手动检查。".into()),
                _ => {}
            }
            #[cfg(test)]
            eprintln!("cart step: {result}");
        }
        Err(
            "等待 Apple 页面超时。浏览器已保留，请检查商品选项或访问验证后重试；未确认加购成功。"
                .into(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "Adds one iPhone 17 to an isolated Apple US cart; never checks out"]
    async fn live_us_cart_and_repeat() {
        let product = apw_core::catalog::Catalog::new()
            .product_by_part("en_US", "MG484LL/A")
            .unwrap();
        let profile = tempfile::tempdir().unwrap();
        let runner = CartRunner {
            profile: profile.path().to_path_buf(),
            ..Default::default()
        };
        println!(
            "{}",
            runner.prepare(&product).await.expect("first add verified")
        );
        println!(
            "{}",
            runner
                .prepare(&product)
                .await
                .expect("repeat reuses quantity one")
        );
    }
}
