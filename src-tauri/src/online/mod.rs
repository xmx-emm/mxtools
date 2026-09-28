//! apex.0w0.online 在线服务客户端（设备码登录、账号态）。
//!
//! 所有 HTTP 请求走 Rust 侧 reqwest：不受 WebView CORS 限制，
//! 令牌也不进入前端 localStorage。

pub mod auth;
mod credential_store;
pub mod presets;

use crate::ipc_error::{IpcError, IpcResult};
#[cfg(debug_assertions)]
use std::net::IpAddr;
use std::time::Duration;

const DEFAULT_API_BASE: &str = "https://apex.0w0.online/api/v1";

#[cfg(debug_assertions)]
fn normalize_api_base_override(value: &str) -> Option<String> {
    let value = value.trim().trim_end_matches('/');
    let parsed = reqwest::Url::parse(value).ok()?;
    let host = parsed.host_str()?.trim_matches(['[', ']']);
    let is_loopback = host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<IpAddr>()
            .ok()
            .is_some_and(|address| address.is_loopback());
    if !is_loopback
        || !matches!(parsed.scheme(), "http" | "https")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return None;
    }
    Some(value.to_string())
}

/// API 根地址；调试构建仅允许通过环境变量指向回环服务。
pub(crate) fn api_base() -> String {
    #[cfg(debug_assertions)]
    if let Some(value) = std::env::var("MXTOOLS_ONLINE_API_BASE")
        .ok()
        .and_then(|value| normalize_api_base_override(&value))
    {
        return value;
    }

    DEFAULT_API_BASE.to_string()
}

pub(crate) fn http_client() -> IpcResult<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("MxTools/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| IpcError::new("online_auth.client_init", error.to_string()))
}

#[cfg(test)]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/online.test.rs"
    ));
}
