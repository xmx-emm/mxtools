//! apex.0w0.online 在线服务客户端（设备码登录、账号态）。
//!
//! 所有 HTTP 请求走 Rust 侧 reqwest：不受 WebView CORS 限制，
//! 令牌也不进入前端 localStorage。

pub mod auth;
mod credential_store;
pub mod presets;

use crate::ipc_error::{IpcError, IpcResult};
use std::time::Duration;

const DEFAULT_API_BASE: &str = "https://apex.0w0.online/api/v1";

/// API 根地址；开发期可用 `MXTOOLS_ONLINE_API_BASE` 指向本地服务。
pub(crate) fn api_base() -> String {
    std::env::var("MXTOOLS_ONLINE_API_BASE")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_API_BASE.to_string())
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
