//! 登录凭据只放系统钥匙串，不进入 Settings、日志或前端读取结果。
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
pub(crate) struct Login {
    pub account: String,
    pub password: String,
}

#[cfg(target_os = "macos")]
const SERVICE: &str = "com.suversal.apple-store-inventory-monitor.checkout";
#[cfg(target_os = "macos")]
const ITEM: &str = "apple-login";

pub(crate) fn load() -> Result<Option<Login>, String> {
    #[cfg(target_os = "macos")]
    {
        use security_framework::passwords::get_generic_password;
        match get_generic_password(SERVICE, ITEM) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map(Some)
                .map_err(|_| "钥匙串中的登录信息无法读取，请重新保存".into()),
            Err(error) if error.code() == -25300 => Ok(None),
            Err(_) => Err("无法读取登录钥匙串，请解锁钥匙串后重试".into()),
        }
    }
    #[cfg(not(target_os = "macos"))]
    Ok(None)
}

#[derive(Serialize)]
pub(crate) struct LoginStatus {
    supported: bool,
    saved: bool,
}

#[tauri::command]
pub(crate) fn checkout_login_status() -> Result<LoginStatus, String> {
    Ok(LoginStatus {
        supported: cfg!(target_os = "macos"),
        saved: load()?.is_some(),
    })
}

#[tauri::command]
pub(crate) fn save_checkout_login(account: String, password: String) -> Result<(), String> {
    let account = account.trim().to_owned();
    if account.is_empty() || password.is_empty() {
        return Err("请填写 Apple 账户和密码".into());
    }
    #[cfg(target_os = "macos")]
    {
        let bytes = serde_json::to_vec(&Login { account, password })
            .map_err(|_| "无法保存登录信息".to_string())?;
        security_framework::passwords::set_generic_password(SERVICE, ITEM, &bytes)
            .map_err(|_| "无法保存到系统钥匙串".into())
    }
    #[cfg(not(target_os = "macos"))]
    Err("当前仅支持 macOS 钥匙串自动登录，请手动登录".into())
}

#[tauri::command]
pub(crate) fn clear_checkout_login() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    match security_framework::passwords::delete_generic_password(SERVICE, ITEM) {
        Ok(()) => Ok(()),
        Err(error) if error.code() == -25300 => Ok(()),
        Err(_) => Err("无法移除钥匙串中的登录信息".into()),
    }
    #[cfg(not(target_os = "macos"))]
    Ok(())
}
