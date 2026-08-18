//! 在线预设：浏览与「使用」匿名可用；发布、评论、举报需要登录。
//! 响应按 JSON 透传给前端，结构校验由服务端负责。

use serde_json::Value;

use super::auth::current_access_token;
use super::{api_base, http_client};
use crate::ipc_error::{IpcError, IpcResult};

fn not_logged_in() -> IpcError {
    IpcError::new("online_auth.not_logged_in", "尚未登录在线账号")
}

fn network_error(error: reqwest::Error) -> IpcError {
    IpcError::new("online_presets.network", error.to_string())
}

fn protocol_error(error: reqwest::Error) -> IpcError {
    IpcError::new("online_presets.protocol", error.to_string())
}

async fn error_from_response(response: reqwest::Response) -> IpcError {
    let status = response.status();
    let body = response.json::<Value>().await.unwrap_or(Value::Null);
    let message =
        super::auth::server_message(&body).unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
    let code = match status.as_u16() {
        429 => "online_presets.rate_limited",
        401 | 403 => "online_auth.unauthorized",
        404 => "online_presets.not_found",
        400 | 422 => "online_presets.rejected",
        _ => "online_presets.server_error",
    };
    IpcError::new(code, message).with_detail("httpStatus", status.as_u16())
}

async fn read_json(response: reqwest::Response) -> IpcResult<Value> {
    if !response.status().is_success() {
        return Err(error_from_response(response).await);
    }
    response.json::<Value>().await.map_err(protocol_error)
}

async fn bearer_token() -> IpcResult<String> {
    current_access_token().await?.ok_or_else(not_logged_in)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlinePresetListQuery {
    pub q: Option<String>,
    pub scope: Option<String>,
    pub sort: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<u32>,
}

#[tauri::command]
pub async fn online_presets_list(query: OnlinePresetListQuery) -> IpcResult<Value> {
    let client = http_client()?;
    let mut request = client.get(format!("{}/presets", api_base()));
    let mut params: Vec<(&str, String)> = Vec::new();
    if let Some(q) = query.q.filter(|value| !value.trim().is_empty()) {
        params.push(("q", q));
    }
    if let Some(scope) = query.scope {
        params.push(("scope", scope));
    }
    if let Some(sort) = query.sort {
        params.push(("sort", sort));
    }
    if let Some(cursor) = query.cursor {
        params.push(("cursor", cursor));
    }
    if let Some(limit) = query.limit {
        params.push(("limit", limit.to_string()));
    }
    request = request.query(&params);
    let response = request.send().await.map_err(network_error)?;
    read_json(response).await
}

/// 匿名「使用」：使用计数 +1 并返回完整快照 payload。
#[tauri::command]
pub async fn online_preset_use(id: String) -> IpcResult<Value> {
    let client = http_client()?;
    let response = client
        .post(format!("{}/presets/{id}/use", api_base()))
        .send()
        .await
        .map_err(network_error)?;
    read_json(response).await
}

#[tauri::command]
pub async fn online_preset_publish(
    title: String,
    description: Option<String>,
    payload: Value,
) -> IpcResult<Value> {
    let token = bearer_token().await?;
    let client = http_client()?;
    let response = client
        .post(format!("{}/presets", api_base()))
        .bearer_auth(token)
        .json(&serde_json::json!({
            "title": title,
            "description": description,
            "appVersion": env!("CARGO_PKG_VERSION"),
            "payload": payload,
        }))
        .send()
        .await
        .map_err(network_error)?;
    read_json(response).await
}

#[tauri::command]
pub async fn online_preset_comments(id: String) -> IpcResult<Value> {
    let client = http_client()?;
    let response = client
        .get(format!("{}/presets/{id}/comments", api_base()))
        .send()
        .await
        .map_err(network_error)?;
    read_json(response).await
}

#[tauri::command]
pub async fn online_preset_comment_create(
    id: String,
    body: String,
    parent_id: Option<String>,
) -> IpcResult<Value> {
    let token = bearer_token().await?;
    let client = http_client()?;
    let response = client
        .post(format!("{}/presets/{id}/comments", api_base()))
        .bearer_auth(token)
        .json(&serde_json::json!({ "body": body, "parentId": parent_id }))
        .send()
        .await
        .map_err(network_error)?;
    read_json(response).await
}

#[tauri::command]
pub async fn online_preset_report(
    id: String,
    reason: String,
    detail: Option<String>,
) -> IpcResult<Value> {
    let token = bearer_token().await?;
    let client = http_client()?;
    let response = client
        .post(format!("{}/presets/{id}/report", api_base()))
        .bearer_auth(token)
        .json(&serde_json::json!({ "reason": reason, "detail": detail }))
        .send()
        .await
        .map_err(network_error)?;
    read_json(response).await
}
