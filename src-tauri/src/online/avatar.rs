//! 在线账号头像。
//!
//! 头像地址来自 `/me`（账号中心同步的第三方头像，域名不固定），因此不放宽
//! WebView 的 `img-src`，而是由 Rust 侧下载、校验后以 data URL 交给前端。
//! 前端不能传入任意 URL：只下载最近一次 `/me` 返回的头像地址。

use base64::Engine;
use reqwest::{redirect, Url};
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::Duration;

use crate::ipc_error::IpcResult;

/// 头像体积上限，超出直接放弃（显示首字母占位）。
const MAX_AVATAR_BYTES: usize = 512 * 1024;

/// 允许的头像格式。不接受 SVG，避免把可执行脚本的文档塞进 data URL。
const ALLOWED_IMAGE_TYPES: [&str; 5] = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/avif",
];

#[derive(Default)]
struct AvatarCache {
    /// 最近一次 `/me` 返回的已校验头像地址。
    url: Option<String>,
    /// `url` 对应的 data URL。
    data_url: Option<(String, String)>,
}

static AVATAR_CACHE: Mutex<AvatarCache> = Mutex::new(AvatarCache {
    url: None,
    data_url: None,
});

/// 头像不能指向本机或内网：拒绝 localhost 与回环、私有、链路本地等地址字面量。
fn is_local_host(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return true;
    };
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_local_ip(ip);
    }
    let domain = host.trim_end_matches('.').to_ascii_lowercase();
    domain == "localhost" || domain.ends_with(".localhost")
}

fn is_local_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_loopback()
                || ip.is_private()
                || ip.is_link_local()
                || ip.is_unspecified()
                || ip.is_broadcast()
                // 100.64.0.0/10 运营商 NAT
                || (ip.octets()[0] == 100 && (ip.octets()[1] & 0xC0) == 64)
        }
        IpAddr::V6(ip) => {
            if let Some(v4) = ip.to_ipv4_mapped() {
                return is_local_ip(IpAddr::V4(v4));
            }
            let first = ip.segments()[0];
            ip.is_loopback()
                || ip.is_unspecified()
                || (first & 0xFE00) == 0xFC00 // fc00::/7 唯一本地
                || (first & 0xFFC0) == 0xFE80 // fe80::/10 链路本地
        }
    }
}

/// 只接受无凭据、非本机/内网的 http(s) 绝对地址。
pub(super) fn normalize_avatar_url(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() || value.len() > 2048 {
        return None;
    }
    let parsed = Url::parse(value).ok()?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || is_local_host(&parsed)
    {
        return None;
    }
    Some(parsed.to_string())
}

/// 规范化 `Content-Type`，仅返回白名单内的图片类型。
pub(super) fn allowed_image_type(content_type: Option<&str>) -> Option<&'static str> {
    let essence = content_type?.split(';').next()?.trim().to_ascii_lowercase();
    ALLOWED_IMAGE_TYPES
        .iter()
        .copied()
        .find(|allowed| *allowed == essence)
}

pub(super) fn to_data_url(content_type: &str, bytes: &[u8]) -> String {
    format!(
        "data:{content_type};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

/// 记录 `/me` 返回的头像地址；账号为空（登出）时清空。
pub(super) fn remember_avatar_url(value: Option<&str>) {
    let url = normalize_avatar_url(value);
    let mut cache = AVATAR_CACHE.lock().expect("avatar cache lock poisoned");
    if cache.url != url {
        cache.data_url = None;
    }
    cache.url = url;
}

/// 头像专用客户端：不跟随重定向（避免校验后被跳转到内网地址），不带任何账号凭据。
fn avatar_client() -> Option<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .redirect(redirect::Policy::none())
        .user_agent(concat!("MxTools/", env!("CARGO_PKG_VERSION")))
        .build()
        .ok()
}

async fn download_avatar(url: &str) -> Option<String> {
    let client = avatar_client()?;
    let mut response = client.get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let content_type = allowed_image_type(
        response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()),
    )?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_AVATAR_BYTES as u64)
    {
        return None;
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if bytes.len() + chunk.len() > MAX_AVATAR_BYTES {
            return None;
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return None;
    }
    Some(to_data_url(content_type, &bytes))
}

/// 返回当前账号头像的 data URL；无头像或下载失败返回 `null`（前端显示占位）。
#[tauri::command]
pub async fn online_auth_get_avatar() -> IpcResult<Option<String>> {
    let url = {
        let cache = AVATAR_CACHE.lock().expect("avatar cache lock poisoned");
        let Some(url) = cache.url.clone() else {
            return Ok(None);
        };
        if let Some((cached_url, data_url)) = cache.data_url.as_ref() {
            if *cached_url == url {
                return Ok(Some(data_url.clone()));
            }
        }
        url
    };
    let Some(data_url) = download_avatar(&url).await else {
        return Ok(None);
    };
    let mut cache = AVATAR_CACHE.lock().expect("avatar cache lock poisoned");
    if cache.url.as_deref() == Some(url.as_str()) {
        cache.data_url = Some((url, data_url.clone()));
    }
    Ok(Some(data_url))
}

#[cfg(test)]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/online_avatar.test.rs"
    ));
}
