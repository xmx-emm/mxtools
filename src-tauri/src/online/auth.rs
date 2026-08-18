//! 设备码登录流程与账号态。
//!
//! 流程：`start` 向服务端申请设备码并在本模块内暂存 → 前端打开浏览器授权页 →
//! 前端按 `interval` 周期调用 `poll`，批准后本模块兑换令牌并写入
//! Windows 凭据管理器。`deviceCode` 全程不进入 WebView。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use zeroize::Zeroize;

use super::{api_base, credential_store, http_client};
use crate::ipc_error::{IpcError, IpcResult};

struct PendingDeviceLogin {
    device_code: String,
    deadline: Instant,
}

static PENDING_LOGIN: Mutex<Option<PendingDeviceLogin>> = Mutex::new(None);

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(super) struct StoredTokens {
    pub(super) access_token: String,
    pub(super) refresh_token: String,
    pub(super) access_token_expires_at: String,
    pub(super) refresh_token_expires_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OnlineAccount {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub role: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceLoginStart {
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum DeviceLoginPoll {
    Pending,
    SlowDown,
    Denied,
    Expired,
    Approved { account: OnlineAccount },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceStartResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    verification_uri_complete: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DevicePollResponse {
    status: String,
    access_token: Option<String>,
    refresh_token: Option<String>,
    access_token_expires_at: Option<String>,
    refresh_token_expires_at: Option<String>,
}

/// 服务端错误体（NestJS 统一格式）。`message` 可能是字符串或数组。
pub(super) fn server_message(body: &Value) -> Option<String> {
    match body.get("message") {
        Some(Value::String(text)) => Some(text.clone()),
        Some(Value::Array(items)) => Some(
            items
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join("; "),
        ),
        _ => None,
    }
}

async fn error_from_response(response: reqwest::Response) -> IpcError {
    let status = response.status();
    let body = response.json::<Value>().await.unwrap_or(Value::Null);
    let message = server_message(&body).unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
    let code = match status.as_u16() {
        429 => "online_auth.rate_limited",
        401 | 403 => "online_auth.unauthorized",
        400 | 422 => "online_auth.rejected",
        _ => "online_auth.server_error",
    };
    IpcError::new(code, message).with_detail("httpStatus", status.as_u16())
}

fn network_error(error: reqwest::Error) -> IpcError {
    IpcError::new("online_auth.network", error.to_string())
}

fn credential_error(code: u32) -> IpcError {
    IpcError::new("online_auth.credential_store", "凭据管理器操作失败")
        .with_detail("win32Code", code)
}

fn save_tokens(tokens: &StoredTokens) -> IpcResult<()> {
    let mut blob = serde_json::to_vec(tokens)
        .map_err(|error| IpcError::new("online_auth.credential_store", error.to_string()))?;
    let result = credential_store::save(&blob).map_err(credential_error);
    blob.zeroize();
    result
}

fn load_tokens() -> IpcResult<Option<StoredTokens>> {
    let Some(mut blob) = credential_store::load().map_err(credential_error)? else {
        return Ok(None);
    };
    let parsed = serde_json::from_slice::<StoredTokens>(&blob);
    blob.zeroize();
    match parsed {
        Ok(tokens) => Ok(Some(tokens)),
        // 旧格式或损坏的凭据：清掉并视为未登录，而不是让登录态卡死。
        Err(_) => {
            credential_store::delete().map_err(credential_error)?;
            Ok(None)
        }
    }
}

/// 发起设备码登录。返回给前端的数据不包含 `deviceCode`。
#[tauri::command]
pub async fn online_auth_start_device_login() -> IpcResult<DeviceLoginStart> {
    let client = http_client()?;
    let response = client
        .post(format!("{}/auth/device/start", api_base()))
        .json(&serde_json::json!({
            "clientLabel": concat!("MxTools ", env!("CARGO_PKG_VERSION")),
        }))
        .send()
        .await
        .map_err(network_error)?;
    if !response.status().is_success() {
        return Err(error_from_response(response).await);
    }
    let started = response
        .json::<DeviceStartResponse>()
        .await
        .map_err(|error| IpcError::new("online_auth.protocol", error.to_string()))?;

    *PENDING_LOGIN.lock().expect("pending login lock poisoned") = Some(PendingDeviceLogin {
        device_code: started.device_code,
        deadline: Instant::now() + Duration::from_secs(started.expires_in),
    });

    Ok(DeviceLoginStart {
        user_code: started.user_code,
        verification_uri: started.verification_uri,
        verification_uri_complete: started.verification_uri_complete,
        expires_in: started.expires_in,
        interval: started.interval.max(2),
    })
}

/// 轮询一次设备码状态；批准后兑换令牌、写入凭据管理器并返回账号。
#[tauri::command]
pub async fn online_auth_poll_device_login() -> IpcResult<DeviceLoginPoll> {
    let device_code = {
        let guard = PENDING_LOGIN.lock().expect("pending login lock poisoned");
        match guard.as_ref() {
            None => {
                return Err(IpcError::new(
                    "online_auth.no_pending_login",
                    "没有进行中的设备码登录",
                ))
            }
            Some(pending) if Instant::now() >= pending.deadline => None,
            Some(pending) => Some(pending.device_code.clone()),
        }
    };
    let Some(device_code) = device_code else {
        clear_pending_login();
        return Ok(DeviceLoginPoll::Expired);
    };

    let client = http_client()?;
    let response = client
        .post(format!("{}/auth/device/poll", api_base()))
        .json(&serde_json::json!({ "deviceCode": device_code }))
        .send()
        .await
        .map_err(network_error)?;
    if response.status().as_u16() == 429 {
        return Ok(DeviceLoginPoll::SlowDown);
    }
    if !response.status().is_success() {
        return Err(error_from_response(response).await);
    }
    let poll = response
        .json::<DevicePollResponse>()
        .await
        .map_err(|error| IpcError::new("online_auth.protocol", error.to_string()))?;

    match poll.status.as_str() {
        "pending" => Ok(DeviceLoginPoll::Pending),
        "denied" => {
            clear_pending_login();
            Ok(DeviceLoginPoll::Denied)
        }
        "expired" => {
            clear_pending_login();
            Ok(DeviceLoginPoll::Expired)
        }
        "approved" => {
            clear_pending_login();
            let tokens = StoredTokens {
                access_token: poll.access_token.ok_or_else(missing_token_error)?,
                refresh_token: poll.refresh_token.ok_or_else(missing_token_error)?,
                access_token_expires_at: poll
                    .access_token_expires_at
                    .ok_or_else(missing_token_error)?,
                refresh_token_expires_at: poll
                    .refresh_token_expires_at
                    .ok_or_else(missing_token_error)?,
            };
            save_tokens(&tokens)?;
            let account = fetch_me(&client, &tokens.access_token).await?;
            Ok(DeviceLoginPoll::Approved { account })
        }
        other => Err(
            IpcError::new("online_auth.protocol", "服务端返回了未知的轮询状态")
                .with_detail("status", other),
        ),
    }
}

fn missing_token_error() -> IpcError {
    IpcError::new("online_auth.protocol", "批准结果缺少令牌字段")
}

fn clear_pending_login() {
    *PENDING_LOGIN.lock().expect("pending login lock poisoned") = None;
}

/// 取消进行中的设备码登录（关闭对话框时调用）。
#[tauri::command]
pub fn online_auth_cancel_device_login() -> IpcResult<()> {
    clear_pending_login();
    Ok(())
}

async fn fetch_me(client: &reqwest::Client, access_token: &str) -> IpcResult<OnlineAccount> {
    let response = client
        .get(format!("{}/me", api_base()))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(network_error)?;
    if !response.status().is_success() {
        return Err(error_from_response(response).await);
    }
    response
        .json::<OnlineAccount>()
        .await
        .map_err(|error| IpcError::new("online_auth.protocol", error.to_string()))
}

/// 用 refresh token 换新令牌。返回 `Ok(None)` 表示 refresh 已失效（应登出）。
async fn refresh_tokens(
    client: &reqwest::Client,
    refresh_token: &str,
) -> IpcResult<Option<StoredTokens>> {
    let response = client
        .post(format!("{}/auth/refresh", api_base()))
        .json(&serde_json::json!({ "refreshToken": refresh_token }))
        .send()
        .await
        .map_err(network_error)?;
    let status = response.status();
    if status.as_u16() == 401 || status.as_u16() == 400 {
        return Ok(None);
    }
    if !status.is_success() {
        return Err(error_from_response(response).await);
    }
    let tokens = response
        .json::<StoredTokens>()
        .await
        .map_err(|error| IpcError::new("online_auth.protocol", error.to_string()))?;
    save_tokens(&tokens)?;
    Ok(Some(tokens))
}

/// 读取当前登录账号；未登录返回 `null`。令牌过期时自动 refresh，
/// refresh 失效则清除本地凭据并视为未登录。网络故障返回错误而不是登出。
#[tauri::command]
pub async fn online_auth_get_account() -> IpcResult<Option<OnlineAccount>> {
    let Some(tokens) = load_tokens()? else {
        return Ok(None);
    };
    let client = http_client()?;

    let response = client
        .get(format!("{}/me", api_base()))
        .bearer_auth(&tokens.access_token)
        .send()
        .await
        .map_err(network_error)?;
    if response.status().is_success() {
        let account = response
            .json::<OnlineAccount>()
            .await
            .map_err(|error| IpcError::new("online_auth.protocol", error.to_string()))?;
        return Ok(Some(account));
    }
    if response.status().as_u16() != 401 {
        return Err(error_from_response(response).await);
    }

    match refresh_tokens(&client, &tokens.refresh_token).await? {
        Some(renewed) => Ok(Some(fetch_me(&client, &renewed.access_token).await?)),
        None => {
            credential_store::delete().map_err(credential_error)?;
            Ok(None)
        }
    }
}

/// 供其他在线功能以登录态调用 API：返回当前有效的 access token，
/// 必要时自动 refresh；refresh 失效时清除本地凭据并返回 `None`。
pub(super) async fn current_access_token() -> IpcResult<Option<String>> {
    let Some(tokens) = load_tokens()? else {
        return Ok(None);
    };
    let client = http_client()?;
    let probe = client
        .get(format!("{}/me", api_base()))
        .bearer_auth(&tokens.access_token)
        .send()
        .await
        .map_err(network_error)?;
    if probe.status().is_success() {
        return Ok(Some(tokens.access_token));
    }
    if probe.status().as_u16() != 401 {
        return Err(error_from_response(probe).await);
    }
    match refresh_tokens(&client, &tokens.refresh_token).await? {
        Some(renewed) => Ok(Some(renewed.access_token)),
        None => {
            credential_store::delete().map_err(credential_error)?;
            Ok(None)
        }
    }
}

/// 登出：撤销 refresh token（尽力而为）并删除本地凭据。
#[tauri::command]
pub async fn online_auth_logout() -> IpcResult<()> {
    if let Some(tokens) = load_tokens()? {
        if let Ok(client) = http_client() {
            let _ = client
                .post(format!("{}/auth/logout", api_base()))
                .json(&serde_json::json!({ "refreshToken": tokens.refresh_token }))
                .send()
                .await;
        }
    }
    credential_store::delete().map_err(credential_error)?;
    clear_pending_login();
    Ok(())
}
