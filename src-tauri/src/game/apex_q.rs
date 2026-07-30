//! APEX Q 弹道计算器：截图 → OCR → 角度。

use crate::game::apex_q_ocr::{
    default_ping_roi, default_showpos_roi, ocr_available, ocr_status, parse_screenshot_kind,
    RoiRect,
};
use crate::game::apex_q_ocr_download;
use crate::game::apex_theta::{compute_theta, ThetaResult};
use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::{blocking_cmd, poll_until};
use image::GenericImageView;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use windows_tool::game::steam::{
    list_steam_screenshot_dirs, normalize_windows_path, SteamScreenshotDirCandidate,
};

/// Apex Legends Steam App ID
pub const APEX_STEAM_APP_ID: usize = 1_172_470;

fn apex_q_error(message: String) -> IpcError {
    let code = if message.starts_with("Screenshot folder does not exist") {
        "apex_q.screenshot_folder_not_found"
    } else if message.starts_with("No screenshot images found")
        || message.starts_with("Screenshot not found")
    {
        "apex_q.screenshot_not_found"
    } else {
        "apex_q.operation_failed"
    };
    IpcError::new(code, message)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexQCaptureResult {
    pub screenshot_path: String,
    pub alpha: Option<f64>,
    pub ang_yaw: Option<f64>,
    pub ang_roll: Option<f64>,
    pub distance_m: Option<f64>,
    pub showpos_text: String,
    pub ping_text: String,
    pub showpos_preview: String,
    pub ping_preview: String,
    pub showpos_engine: String,
    pub ping_engine: String,
    pub showpos_confidence: Option<f32>,
    pub ping_confidence: Option<f32>,
    pub theta: Option<ThetaResult>,
    pub error: Option<String>,
}

fn folder_path(folder: &str) -> PathBuf {
    PathBuf::from(normalize_windows_path(folder))
}

fn list_images_by_mtime(dir: &Path) -> Result<Vec<(std::time::SystemTime, PathBuf)>, String> {
    if !dir.is_dir() {
        return Err(format!(
            "Screenshot folder does not exist: {}",
            dir.display()
        ));
    }
    let mut items = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "bmp" | "webp") {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        items.push((modified, path));
    }
    items.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(items)
}

fn latest_image_in_dir(dir: &Path) -> Result<PathBuf, String> {
    list_images_by_mtime(dir)?
        .into_iter()
        .next()
        .map(|(_, p)| p)
        .ok_or_else(|| format!("No screenshot images found in {}", dir.display()))
}

fn capture_error_result(screenshot_path: String, error: impl Into<String>) -> ApexQCaptureResult {
    ApexQCaptureResult {
        screenshot_path,
        alpha: None,
        ang_yaw: None,
        ang_roll: None,
        distance_m: None,
        showpos_text: String::new(),
        ping_text: String::new(),
        showpos_preview: String::new(),
        ping_preview: String::new(),
        showpos_engine: String::new(),
        ping_engine: String::new(),
        showpos_confidence: None,
        ping_confidence: None,
        theta: None,
        error: Some(error.into()),
    }
}

fn unix_ms_to_system_time(ms: u64) -> SystemTime {
    UNIX_EPOCH
        .checked_add(Duration::from_millis(ms))
        .unwrap_or(UNIX_EPOCH)
}

/// Steam can finish writing a screenshot a little before the global-shortcut
/// callback reaches us. Keep a small clock-skew allowance while still
/// rejecting an older "latest" file from a previous capture.
const FRESH_SCREENSHOT_GRACE: Duration = Duration::from_millis(1_500);

type ScreenshotSnapshot = (PathBuf, SystemTime, u64);
static LAST_CAPTURE_SNAPSHOT: OnceLock<Mutex<Option<ScreenshotSnapshot>>> = OnceLock::new();

fn last_capture_snapshot() -> Option<ScreenshotSnapshot> {
    LAST_CAPTURE_SNAPSHOT
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|snapshot| snapshot.clone())
}

fn remember_capture_snapshot(snapshot: ScreenshotSnapshot) {
    if let Ok(mut previous) = LAST_CAPTURE_SNAPSHOT
        .get_or_init(|| Mutex::new(None))
        .lock()
    {
        *previous = Some(snapshot);
    }
}

fn screenshot_is_stale(modified: SystemTime, capture_started_at: SystemTime) -> bool {
    capture_started_at
        .duration_since(modified)
        .map(|age| age > FRESH_SCREENSHOT_GRACE)
        .unwrap_or(false)
}

fn latest_image_is_stable_and_fresh(
    dir: &Path,
    capture_started_at: SystemTime,
    previous: &mut Option<(PathBuf, SystemTime, u64)>,
) -> bool {
    let Some((modified, path)) = list_images_by_mtime(dir)
        .ok()
        .and_then(|items| items.into_iter().next())
    else {
        *previous = None;
        return false;
    };
    if screenshot_is_stale(modified, capture_started_at) {
        *previous = None;
        return false;
    }
    let Ok(length) = std::fs::metadata(&path).map(|metadata| metadata.len()) else {
        *previous = None;
        return false;
    };
    if length == 0 {
        *previous = Some((path, modified, length));
        return false;
    }
    let stable = previous
        .as_ref()
        .map(|(previous_path, previous_modified, previous_length)| {
            previous_path == &path && previous_modified == &modified && *previous_length == length
        })
        .unwrap_or(false);
    *previous = Some((path, modified, length));
    stable
}

#[tauri::command]
pub async fn apex_q_ocr_available() -> IpcResult<bool> {
    blocking_cmd(|| Ok(ocr_available()))
        .await
        .map_err(apex_q_error)
}

#[tauri::command]
pub async fn apex_q_ocr_status() -> IpcResult<crate::game::apex_q_rapid_ocr::OcrStatus> {
    blocking_cmd(|| Ok(ocr_status()))
        .await
        .map_err(apex_q_error)
}

#[tauri::command]
pub async fn apex_q_ocr_download(app: tauri::AppHandle) -> IpcResult<()> {
    apex_q_ocr_download::download_ocr_pack(app)
        .await
        .map_err(|message| IpcError::new("apex_q.ocr_download_failed", message))
}

#[tauri::command]
pub async fn apex_q_ocr_delete() -> IpcResult<()> {
    blocking_cmd(apex_q_ocr_download::delete_ocr_pack)
        .await
        .map_err(|message| IpcError::new("apex_q.ocr_delete_failed", message))
}

#[tauri::command]
pub async fn apex_q_normalize_path(path: String) -> IpcResult<String> {
    Ok(normalize_windows_path(&path))
}

#[tauri::command]
pub async fn apex_q_list_steam_screenshot_dirs() -> IpcResult<Vec<SteamScreenshotDirCandidate>> {
    blocking_cmd(|| list_steam_screenshot_dirs(APEX_STEAM_APP_ID))
        .await
        .map_err(apex_q_error)
}

#[tauri::command]
pub async fn apex_q_suggested_screenshot_dir() -> IpcResult<Option<String>> {
    blocking_cmd(|| {
        Ok(
            windows_tool::game::steam::get_suggested_steam_screenshots_dir(APEX_STEAM_APP_ID)
                .map(|p| normalize_windows_path(&p.to_string_lossy())),
        )
    })
    .await
    .map_err(apex_q_error)
}

#[tauri::command]
pub async fn apex_q_latest_screenshot(folder: String) -> IpcResult<String> {
    blocking_cmd(move || {
        let path = latest_image_in_dir(&folder_path(&folder))?;
        Ok(normalize_windows_path(&path.to_string_lossy()))
    })
    .await
    .map_err(apex_q_error)
}

#[tauri::command]
pub async fn apex_q_list_recent_screenshots(folder: String, limit: u32) -> IpcResult<Vec<String>> {
    blocking_cmd(move || {
        let lim = limit.clamp(1, 50) as usize;
        let items = list_images_by_mtime(&folder_path(&folder))?;
        Ok(items
            .into_iter()
            .take(lim)
            .map(|(_, p)| normalize_windows_path(&p.to_string_lossy()))
            .collect())
    })
    .await
    .map_err(apex_q_error)
}

/// 返回可用于 `<img src>` 的 data URL。
/// `max_edge == 0`：不缩小（校准主图用）；否则等比缩小并降质（选图缩略图用）。
#[tauri::command]
pub async fn apex_q_screenshot_preview(path: String, max_edge: u32) -> IpcResult<String> {
    use base64::Engine;
    use image::codecs::jpeg::JpegEncoder;
    use image::ImageEncoder;

    blocking_cmd(move || {
        let path = folder_path(&path);
        if !path.is_file() {
            return Err(format!("Screenshot not found: {}", path.display()));
        }
        let max_edge = if max_edge == 0 {
            // 校准主图：限制最大边，避免超大图 base64 撑爆 IPC
            2560
        } else {
            max_edge.clamp(64, 1920)
        };
        let jpeg_quality: u8 = if max_edge >= 1920 { 90 } else { 68 };
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let is_jpeg = matches!(ext.as_str(), "jpg" | "jpeg");

        // 已是 JPEG 且边长不大：直接读文件，避免解码再编码
        if is_jpeg {
            if let Ok((w, h)) = image::image_dimensions(&path) {
                if w.max(h) <= max_edge {
                    let bytes = std::fs::read(&path).map_err(|e| format!("read image: {e}"))?;
                    // 再限制绝对体积（约 8MB base64 前）
                    if bytes.len() <= 6 * 1024 * 1024 {
                        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                        return Ok(format!("data:image/jpeg;base64,{b64}"));
                    }
                }
            }
        }

        let img = image::open(&path).map_err(|e| format!("Failed to open image: {e}"))?;
        let (w, h) = img.dimensions();
        let scaled = if w.max(h) > max_edge {
            let scale = max_edge as f32 / w.max(h) as f32;
            let nw = ((w as f32) * scale).round().max(1.0) as u32;
            let nh = ((h as f32) * scale).round().max(1.0) as u32;
            // Triangle 比 CatmullRom 快，缩略图够用
            img.resize(nw, nh, image::imageops::FilterType::Triangle)
        } else {
            img
        };

        let rgb = scaled.to_rgb8();
        let mut buf = Vec::with_capacity((rgb.width() * rgb.height()) as usize / 4);
        {
            let encoder = JpegEncoder::new_with_quality(&mut buf, jpeg_quality);
            encoder
                .write_image(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|e| format!("encode jpeg: {e}"))?;
        }
        let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
        Ok(format!("data:image/jpeg;base64,{b64}"))
    })
    .await
    .map_err(apex_q_error)
}

/// 对指定截图 + ROI 做一次 OCR 校验（不计算角度）。
/// `kind`: `"showpos"` / `"ping"` 只识别当前校准项；缺省则两个都识别。
/// `engine`: `"rapid"` / `"win"` / `"auto"`；缺省 auto。
#[tauri::command]
pub async fn apex_q_test_ocr(
    path: String,
    showpos_roi: RoiRect,
    ping_roi: RoiRect,
    kind: Option<String>,
    engine: Option<String>,
) -> IpcResult<crate::game::apex_q_ocr::OcrParseResult> {
    blocking_cmd(move || {
        let path = folder_path(&path);
        if !path.is_file() {
            return Err(format!("Screenshot not found: {}", path.display()));
        }
        let kind_ref = kind.as_deref();
        let engine_ref = engine.as_deref();
        parse_screenshot_kind(&path, &showpos_roi, &ping_roi, kind_ref, engine_ref)
    })
    .await
    .map_err(apex_q_error)
}

#[tauri::command]
pub async fn apex_q_compute_theta(r: f64, alpha: f64) -> IpcResult<ThetaResult> {
    if !r.is_finite() || r <= 0.0 {
        return Err(IpcError::new(
            "apex_q.invalid_distance",
            "Distance r must be a positive number",
        ));
    }
    if !alpha.is_finite() {
        return Err(IpcError::new(
            "apex_q.invalid_alpha",
            "Alpha must be a finite number",
        ));
    }
    Ok(compute_theta(r, alpha))
}

#[tauri::command]
pub async fn apex_q_default_rois() -> IpcResult<(RoiRect, RoiRect)> {
    Ok((default_showpos_roi(), default_ping_roi()))
}

#[tauri::command]
pub async fn apex_q_from_latest_screenshot(
    folder: String,
    delay_ms: u64,
    showpos_roi: RoiRect,
    ping_roi: RoiRect,
    engine: Option<String>,
    capture_started_at_ms: Option<u64>,
    require_fresh: Option<bool>,
) -> IpcResult<ApexQCaptureResult> {
    // The timestamp is taken by the main WebView immediately before invoking
    // this command. It lets the hotkey path distinguish a newly written Steam
    // screenshot from an older file that merely happens to be the latest one.
    let capture_started_at = capture_started_at_ms
        .map(unix_ms_to_system_time)
        .unwrap_or_else(SystemTime::now);
    let fresh_required = require_fresh.unwrap_or(capture_started_at_ms.is_some());
    if delay_ms > 0 {
        tokio::time::sleep(Duration::from_millis(delay_ms.min(5000))).await;
    }
    let stable_capture: Option<ScreenshotSnapshot> = if fresh_required {
        let poll_dir = folder_path(&folder);
        let poll_started_at = capture_started_at;
        let mut previous_snapshot: Option<(PathBuf, SystemTime, u64)> = None;
        // Steam writes the image asynchronously after the shortcut callback. Give
        // it the same short polling window used elsewhere in the app before
        // reporting SCREENSHOT_STALE. Require two identical metadata snapshots so
        // OCR does not open a partially written image.
        let stable_snapshot = poll_until(|| {
            latest_image_is_stable_and_fresh(&poll_dir, poll_started_at, &mut previous_snapshot)
        })
        .await;
        if !stable_snapshot {
            return Ok(capture_error_result(String::new(), "SCREENSHOT_STALE"));
        }
        previous_snapshot
    } else {
        None
    };
    let previous_capture_snapshot = last_capture_snapshot();
    blocking_cmd(move || {
        let dir = folder_path(&folder);
        let (path, modified, stable_length) = match stable_capture.clone() {
            Some((path, modified, length)) => (path, modified, length),
            None => {
                let (modified, path) = list_images_by_mtime(&dir)?
                    .into_iter()
                    .next()
                    .ok_or_else(|| format!("No screenshot images found in {}", dir.display()))?;
                let length = std::fs::metadata(&path)
                    .map(|metadata| metadata.len())
                    .map_err(|e| e.to_string())?;
                (path, modified, length)
            }
        };
        let screenshot_path = normalize_windows_path(&path.to_string_lossy());
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        let length = metadata.len();
        let current_modified = metadata.modified().unwrap_or(modified);
        if fresh_required {
            if current_modified != modified
                || length != stable_length
                || screenshot_is_stale(current_modified, capture_started_at)
            {
                return Ok(capture_error_result(screenshot_path, "SCREENSHOT_STALE"));
            }
            if previous_capture_snapshot.as_ref().is_some_and(|previous| {
                previous.0 == path && previous.1 == current_modified && previous.2 == length
            }) {
                return Ok(capture_error_result(screenshot_path, "SCREENSHOT_STALE"));
            }
        }
        remember_capture_snapshot((path.clone(), current_modified, length));
        let engine_ref = engine.as_deref();
        let parsed = match parse_screenshot_kind(&path, &showpos_roi, &ping_roi, None, engine_ref) {
            Ok(p) => p,
            Err(e) => {
                return Ok(capture_error_result(screenshot_path, e));
            }
        };

        let mut error = None;
        let theta = match (parsed.distance_m, parsed.alpha) {
            (Some(r), Some(a)) => Some(compute_theta(r, a)),
            (None, None) => {
                error = Some("PARSE_FAILED_BOTH".into());
                None
            }
            (None, _) => {
                error = Some("PARSE_FAILED_PING".into());
                None
            }
            (_, None) => {
                error = Some("PARSE_FAILED_ANG".into());
                None
            }
        };

        Ok(ApexQCaptureResult {
            screenshot_path,
            alpha: parsed.alpha,
            ang_yaw: parsed.ang_yaw,
            ang_roll: parsed.ang_roll,
            distance_m: parsed.distance_m,
            showpos_text: parsed.showpos_text,
            ping_text: parsed.ping_text,
            showpos_preview: parsed.showpos_preview,
            ping_preview: parsed.ping_preview,
            showpos_engine: parsed.showpos_engine,
            ping_engine: parsed.ping_engine,
            showpos_confidence: parsed.showpos_confidence,
            ping_confidence: parsed.ping_confidence,
            theta,
            error,
        })
    })
    .await
    .map_err(apex_q_error)
}

#[tauri::command]
pub async fn apex_q_open_ocr_settings() -> IpcResult<()> {
    crate::input_method::open_ms_settings_page("ms-settings:regionlanguage".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn freshness_grace_accepts_recent_or_future_files() {
        let started = UNIX_EPOCH + Duration::from_secs(100);
        assert!(!screenshot_is_stale(
            started - Duration::from_millis(1_500),
            started,
        ));
        assert!(!screenshot_is_stale(
            started + Duration::from_secs(1),
            started
        ));
    }

    #[test]
    fn freshness_rejects_files_older_than_grace() {
        let started = UNIX_EPOCH + Duration::from_secs(100);
        assert!(screenshot_is_stale(
            started - Duration::from_millis(1_501),
            started,
        ));
    }
}
