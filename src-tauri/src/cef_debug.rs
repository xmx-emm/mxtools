//! CEF DevTools 协议客户端（本机回环 ws://，无 TLS）。
//! 供 Steam / EA 客户端自动化复用：枚举页面目标、读取浏览器版本、`Runtime.evaluate`。

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

const HTTP_TIMEOUT: Duration = Duration::from_secs(5);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
const EVAL_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, Deserialize)]
pub struct CefTarget {
    #[allow(dead_code)] // EA 线路会用到 id/url 匹配页面
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    #[allow(dead_code)] // EA 线路会用到 id/url 匹配页面
    pub url: String,
    #[serde(rename = "webSocketDebuggerUrl")]
    pub ws_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CefVersion {
    #[serde(rename = "Browser", default)]
    pub browser: String,
    #[serde(rename = "User-Agent", default)]
    pub user_agent: String,
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())
}

/// 列出调试端口上的所有页面目标；端口未开时返回 Err。
pub async fn list_targets(port: u16) -> Result<Vec<CefTarget>, String> {
    let url = format!("http://127.0.0.1:{port}/json");
    let resp = http_client()?
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("CEF /json HTTP {}", resp.status()));
    }
    resp.json::<Vec<CefTarget>>()
        .await
        .map_err(|e| e.to_string())
}

/// 读取 CEF 版本信息（Browser / User-Agent），用于版本校验记录。
pub async fn browser_version(port: u16) -> Result<CefVersion, String> {
    let url = format!("http://127.0.0.1:{port}/json/version");
    let resp = http_client()?
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("CEF /json/version HTTP {}", resp.status()));
    }
    resp.json::<CefVersion>().await.map_err(|e| e.to_string())
}

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// 单个页面目标的 DevTools 会话（串行 evaluate）。
pub struct CefPage {
    ws: WsStream,
    next_id: u64,
}

impl CefPage {
    pub async fn connect(ws_url: &str) -> Result<Self, String> {
        let connect = tokio_tungstenite::connect_async(ws_url);
        let (ws, _) = tokio::time::timeout(CONNECT_TIMEOUT, connect)
            .await
            .map_err(|_| format!("CEF ws 连接超时: {ws_url}"))?
            .map_err(|e| format!("CEF ws 连接失败: {e}"))?;
        Ok(Self { ws, next_id: 0 })
    }

    /// 执行 JS（awaitPromise + returnByValue），返回 `result.result.value`。
    pub async fn evaluate(&mut self, expression: &str) -> Result<serde_json::Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        let request = serde_json::json!({
            "id": id,
            "method": "Runtime.evaluate",
            "params": {
                "expression": expression,
                "returnByValue": true,
                "awaitPromise": true,
            }
        });
        let text = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        self.ws
            .send(tokio_tungstenite::tungstenite::Message::Text(text.into()))
            .await
            .map_err(|e| format!("CEF ws 发送失败: {e}"))?;

        let deadline = std::time::Instant::now() + EVAL_TIMEOUT;
        loop {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            if remaining.is_zero() {
                return Err("CEF evaluate 超时".to_string());
            }
            let frame = match tokio::time::timeout(remaining, self.ws.next()).await {
                Ok(Some(frame)) => frame.map_err(|e| format!("CEF ws 读取失败: {e}"))?,
                Ok(None) => return Err("CEF ws 已关闭".to_string()),
                Err(_) => return Err("CEF evaluate 超时".to_string()),
            };
            let tokio_tungstenite::tungstenite::Message::Text(payload) = frame else {
                continue;
            };
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&payload) else {
                continue;
            };
            if value.get("id").and_then(|v| v.as_u64()) != Some(id) {
                continue;
            }
            if let Some(error) = value.get("error") {
                return Err(format!("CEF evaluate 错误: {error}"));
            }
            let result = &value["result"];
            if let Some(exception) = result.get("exceptionDetails") {
                let desc = exception["exception"]["description"]
                    .as_str()
                    .or_else(|| exception["text"].as_str())
                    .unwrap_or("未知 JS 异常");
                return Err(format!("JS 异常: {desc}"));
            }
            return Ok(result["result"]["value"].clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/cef_debug.rs"
    ));
}
