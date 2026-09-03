//! Steam 后台静默一键下载 Apex 语音包。
//!
//! 通过 CEF 调试端口驱动本机 Steam 客户端控制台执行 `download_depot`：
//! - 不接触账号凭据，下载用的是用户自己已登录的 Steam 会话；
//! - 全程不弹出 Steam 窗口（必要时先 `-shutdown` 再以 `-cef-enable-debugging -silent` 重启到托盘）；
//! - 每次运行做能力探测并记录客户端版本：Steam 更新导致内部 API 变化时明确报错、回退手动流程。

use crate::cef_debug::{browser_version, list_targets, CefPage};
use crate::game::apex::{apex_is_running_sync, copy_miles_language_to_game};
use crate::game::steam::steam_is_running_sync;
use crate::ipc_error::{IpcError, IpcResult};
use crate::log_info;
use crate::utils::blocking_cmd;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use windows_tool::game::apex::get_apex_depot_download_folder_path;
use windows_tool::registry::steam::get_steam_path_by_registry;
use windows_tool::utils::CommandHiddenWindowExt;

const STEAM_CEF_PORT: u16 = 8080;
const APEX_APP_ID: u32 = 1172470;
pub const APEX_MILES_DOWNLOAD_EVENT: &str = "apex-miles-download-progress";

const STEAM_EXIT_TIMEOUT: Duration = Duration::from_secs(45);
const CEF_PORT_TIMEOUT: Duration = Duration::from_secs(120);
const STEAM_LOGIN_TIMEOUT: Duration = Duration::from_secs(90);
const DOWNLOAD_START_TIMEOUT: Duration = Duration::from_secs(45);
const STALL_TIMEOUT: Duration = Duration::from_secs(300);
const OVERALL_TIMEOUT: Duration = Duration::from_secs(90 * 60);

/// 能力探测：Steam 客户端更新后若内部 API 变更，此处会失败并走回退。
const PROBE_JS: &str = r"(() => {
  const c = window.SteamClient && window.SteamClient.Console;
  return !!(c && typeof c.ExecCommand === 'function' && typeof c.RegisterForSpewOutput === 'function');
})()";

const DRAIN_SPEW_JS: &str =
    r"window.__mxSpew ? window.__mxSpew.splice(0, window.__mxSpew.length).join('\n') : ''";

const CLEANUP_JS: &str = r"(() => {
  try { window.__mxSpewReg && window.__mxSpewReg.unregister(); } catch (e) {}
  delete window.__mxSpew;
  delete window.__mxSpewReg;
  return 'ok';
})()";

pub mod phase {
    pub const CHECKING: &str = "checking";
    pub const RESTARTING_STEAM: &str = "restartingSteam";
    pub const WAITING_STEAM: &str = "waitingSteam";
    pub const DOWNLOADING: &str = "downloading";
    pub const APPLYING: &str = "applying";
    pub const DONE: &str = "done";
    pub const ERROR: &str = "error";
    pub const CANCELLED: &str = "cancelled";
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilesDownloadProgress {
    pub phase: String,
    pub depot: u32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f64,
    /// i18n key 或诊断信息（错误码放 message）
    pub message: String,
    /// 探测到的 Steam CEF 版本（诊断/版本校验用）
    pub cef_browser: String,
}

impl MilesDownloadProgress {
    pub(crate) fn new(depot: u32, phase: &str) -> Self {
        Self {
            phase: phase.to_string(),
            depot,
            ..Default::default()
        }
    }
}

/// 一次 depot 下载的目标（与 Apex 解耦，便于实机测试用小 depot 验证）。
pub(crate) struct DownloadTarget {
    pub app_id: u32,
    pub depot: u32,
    /// Steam 控制台下载落盘的 depot 根目录（`steamapps/content/app_{app}/depot_{depot}`）
    pub depot_root: PathBuf,
}

struct DownloadSession {
    cancel: Arc<AtomicBool>,
    last: MilesDownloadProgress,
}

fn session_cell() -> &'static Mutex<Option<DownloadSession>> {
    static CELL: OnceLock<Mutex<Option<DownloadSession>>> = OnceLock::new();
    CELL.get_or_init(|| Mutex::new(None))
}

/// Steam 与 EA 共用同一个前端进度事件和 store，因此一次只允许一个下载任务。
fn download_gate() -> &'static Mutex<bool> {
    static GATE: OnceLock<Mutex<bool>> = OnceLock::new();
    GATE.get_or_init(|| Mutex::new(false))
}

pub(crate) fn try_acquire_download_gate() -> Result<bool, String> {
    let mut guard = download_gate().lock().map_err(|e| e.to_string())?;
    if *guard {
        return Ok(false);
    }
    *guard = true;
    Ok(true)
}

pub(crate) fn release_download_gate() {
    if let Ok(mut guard) = download_gate().lock() {
        *guard = false;
    }
}

fn emit(app: &AppHandle, progress: &MilesDownloadProgress) {
    if let Ok(mut guard) = session_cell().lock() {
        if let Some(session) = guard.as_mut() {
            session.last = progress.clone();
        }
    }
    let _ = app.emit(APEX_MILES_DOWNLOAD_EVENT, progress);
}

fn steam_exe_path() -> Result<PathBuf, String> {
    let dir = get_steam_path_by_registry().ok_or("apex.milesDl.steamNotFound")?;
    let exe = PathBuf::from(dir).join("steam.exe");
    if exe.is_file() {
        Ok(exe)
    } else {
        Err("apex.milesDl.steamNotFound".to_string())
    }
}

/// `HKCU\Software\Valve\Steam\ActiveProcess`：`RunningAppID` 非 0 表示有游戏在跑。
fn steam_running_app_id() -> u32 {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Valve\Steam\ActiveProcess")
        .and_then(|k| k.get_value::<u32, _>("RunningAppID"))
        .unwrap_or(0)
}

fn reject_running_steam_game(running_app_id: u32) -> Result<(), String> {
    if running_app_id != 0 {
        Err("apex.milesDl.gameRunning".to_string())
    } else {
        Ok(())
    }
}

/// 当前登录的 Steam 用户（0 = 未登录）。
fn steam_active_user() -> u32 {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Valve\Steam\ActiveProcess")
        .and_then(|k| k.get_value::<u32, _>("ActiveUser"))
        .unwrap_or(0)
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                total += meta.len();
            }
        }
    }
    total
}

#[derive(Serialize, Deserialize)]
struct CefProbeRecord {
    browser: String,
    user_agent: String,
    ok: bool,
    probed_at: String,
}

fn probe_record_path() -> Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "APPDATA not set".to_string())?;
    Ok(base.join("mxtools").join("steam_cef_probe.json"))
}

/// 记录探测结果；版本与上次成功探测不一致时打日志（便于 Steam 更新后排查）。
fn save_probe_record(browser: &str, user_agent: &str, ok: bool) {
    let Ok(path) = probe_record_path() else {
        return;
    };
    if !ok {
        if let Ok(prev) = std::fs::read_to_string(&path) {
            if let Ok(record) = serde_json::from_str::<CefProbeRecord>(&prev) {
                if record.ok && record.browser != browser {
                    log_info!(
                        "Steam CEF 版本已变化: {} -> {}（能力探测失败，疑似客户端更新改动了内部 API）",
                        record.browser,
                        browser
                    );
                }
            }
        }
    }
    let record = CefProbeRecord {
        browser: browser.to_string(),
        user_agent: user_agent.to_string(),
        ok,
        probed_at: chrono::Local::now().to_rfc3339(),
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(&record) {
        let _ = std::fs::write(&path, json);
    }
}

async fn ensure_cef_debugging(app: &AppHandle, depot: u32) -> Result<(), String> {
    reject_running_steam_game(steam_running_app_id())?;
    if list_targets(STEAM_CEF_PORT).await.is_ok() {
        return Ok(());
    }

    if steam_is_running_sync()? {
        emit(
            app,
            &MilesDownloadProgress::new(depot, phase::RESTARTING_STEAM),
        );
        let exe = steam_exe_path()?;
        let _ = std::process::Command::new(&exe)
            .arg("-shutdown")
            .with_hidden_window()
            .spawn();
        let deadline = Instant::now() + STEAM_EXIT_TIMEOUT;
        while steam_is_running_sync()? {
            if Instant::now() > deadline {
                return Err("apex.milesDl.steamExitTimeout".to_string());
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }

    emit(
        app,
        &MilesDownloadProgress::new(depot, phase::WAITING_STEAM),
    );
    let exe = steam_exe_path()?;
    std::process::Command::new(&exe)
        .args(["-cef-enable-debugging", "-silent"])
        .with_hidden_window()
        .spawn()
        .map_err(|e| format!("apex.milesDl.steamLaunchFailed: {e}"))?;

    let deadline = Instant::now() + CEF_PORT_TIMEOUT;
    while list_targets(STEAM_CEF_PORT).await.is_err() {
        if Instant::now() > deadline {
            return Err("apex.milesDl.cefPortTimeout".to_string());
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }

    // 等 Steam 完成登录（控制台 download_depot 需要已登录会话）
    let deadline = Instant::now() + STEAM_LOGIN_TIMEOUT;
    while steam_active_user() == 0 {
        if Instant::now() > deadline {
            return Err("apex.milesDl.loginRequired".to_string());
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    Ok(())
}

/// 连接 SharedJSContext 并做能力探测 + 版本记录；探测失败返回回退错误。
async fn connect_and_probe() -> Result<CefPage, String> {
    let version =
        browser_version(STEAM_CEF_PORT)
            .await
            .unwrap_or_else(|_| crate::cef_debug::CefVersion {
                browser: String::new(),
                user_agent: String::new(),
            });

    let targets = list_targets(STEAM_CEF_PORT).await?;
    let Some(shared) = targets
        .into_iter()
        .find(|t| t.kind == "page" && t.title == "SharedJSContext")
    else {
        return Err("apex.milesDl.cefNoSharedContext".to_string());
    };
    let Some(ws_url) = shared.ws_url else {
        return Err("apex.milesDl.cefNoSharedContext".to_string());
    };
    let mut page = CefPage::connect(&ws_url).await?;

    let probe = page
        .evaluate(PROBE_JS)
        .await
        .ok()
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    save_probe_record(&version.browser, &version.user_agent, probe);
    if !probe {
        log_info!("Steam Console API 探测失败, CEF: {}", version.browser);
        return Err("apex.milesDl.steamApiChanged".to_string());
    }
    log_info!("Steam Console API 探测通过, CEF: {}", version.browser);
    Ok(page)
}

fn inject_and_start_js(app_id: u32, depot: u32) -> String {
    format!(
        r"(() => {{
  if (!window.__mxSpew || !window.__mxSpewReg) {{
    window.__mxSpew = [];
    window.__mxSpewReg = SteamClient.Console.RegisterForSpewOutput(function (rec) {{
      try {{ window.__mxSpew.push(String((rec && rec.spew) || '')); }} catch (e) {{}}
    }});
  }} else {{
    window.__mxSpew.length = 0;
  }}
  SteamClient.Console.ExecCommand('download_depot {app_id} {depot}');
  return 'ok';
}})()",
    )
}

/// 从 spew 文本解析下载结果。返回 Ok(Some(总字节数)) 表示已开始下载。
fn parse_start_line(spew: &str, depot: u32) -> Result<Option<u64>, String> {
    for line in spew.lines() {
        let line = line.trim();
        if line.contains("Depot download failed")
            || line.contains("Access Denied")
            || line.contains("not available")
            || line.to_ascii_lowercase().contains("not logged")
        {
            return Err(format!("apex.milesDl.downloadRejected: {line}"));
        }
        let prefix = format!("Downloading depot {depot}");
        if line.starts_with(&prefix) {
            // 形如 "Downloading depot 1172477 (2 files, 3619 MB) ..."
            let total_mb = line
                .rsplit_once(',')
                .and_then(|(_, tail)| tail.trim().strip_suffix("MB) ..."))
                .and_then(|s| s.trim().parse::<f64>().ok())
                .unwrap_or(0.0);
            return Ok(Some((total_mb * 1024.0 * 1024.0) as u64));
        }
    }
    Ok(None)
}

fn is_complete_line(spew: &str) -> bool {
    spew.lines()
        .any(|l| l.trim().starts_with("Depot download complete"))
}

/// 经 CEF 控制台完成一次 depot 下载；进度经 `on_progress(downloaded, total)` 回报。
/// 返回下载总字节数。调用前需确保 Steam 已以调试模式就绪（见 `ensure_cef_debugging`）。
pub(crate) async fn download_depot_via_cef(
    target: &DownloadTarget,
    cancel: &Arc<AtomicBool>,
    on_progress: &(dyn Fn(u64, u64) + Send + Sync),
) -> Result<u64, String> {
    let started = Instant::now();
    let mut page = connect_and_probe().await?;
    page.evaluate(&inject_and_start_js(target.app_id, target.depot))
        .await?;

    // 等待 "Downloading depot ... (N files, M MB) ..." 起始行，拿到总大小
    let mut total_bytes = 0u64;
    let deadline = Instant::now() + DOWNLOAD_START_TIMEOUT;
    while total_bytes == 0 {
        if cancel.load(Ordering::Relaxed) {
            let _ = page.evaluate(CLEANUP_JS).await;
            return Err("cancelled".to_string());
        }
        if Instant::now() > deadline {
            let _ = page.evaluate(CLEANUP_JS).await;
            return Err("apex.milesDl.downloadStartTimeout".to_string());
        }
        let spew = page
            .evaluate(DRAIN_SPEW_JS)
            .await?
            .as_str()
            .unwrap_or_default()
            .to_string();
        if let Some(total) = parse_start_line(&spew, target.depot)? {
            total_bytes = total;
        } else {
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }

    let mut last_size = 0u64;
    let mut last_growth = Instant::now();
    let mut size_reached_at: Option<Instant> = None;
    loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = page.evaluate(CLEANUP_JS).await;
            return Err("cancelled".to_string());
        }
        if started.elapsed() > OVERALL_TIMEOUT {
            let _ = page.evaluate(CLEANUP_JS).await;
            return Err("apex.milesDl.overallTimeout".to_string());
        }

        let size = dir_size(&target.depot_root);
        if size != last_size {
            last_size = size;
            last_growth = Instant::now();
        } else if size < total_bytes && last_growth.elapsed() > STALL_TIMEOUT {
            let _ = page.evaluate(CLEANUP_JS).await;
            return Err("apex.milesDl.downloadStalled".to_string());
        }

        let spew = page
            .evaluate(DRAIN_SPEW_JS)
            .await?
            .as_str()
            .unwrap_or_default()
            .to_string();
        parse_start_line(&spew, target.depot)?; // 复用错误行检测
        if is_complete_line(&spew) {
            break;
        }
        if total_bytes > 0 && size >= total_bytes {
            // 字节数已够但 spew 未出完成行：宽限 20s，超时按完成处理
            match size_reached_at {
                None => size_reached_at = Some(Instant::now()),
                Some(t) if t.elapsed() > Duration::from_secs(20) => {
                    log_info!(
                        "depot {} 字节数已达总量但未收到完成行, 按完成处理",
                        target.depot
                    );
                    break;
                }
                _ => {}
            }
        }

        on_progress(size, total_bytes);
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    let _ = page.evaluate(CLEANUP_JS).await;
    Ok(total_bytes)
}

async fn run_download(app: AppHandle, depot: u32, cancel: Arc<AtomicBool>) {
    let result = run_download_inner(&app, depot, &cancel).await;
    let final_progress = match result {
        Ok(()) => MilesDownloadProgress::new(depot, phase::DONE),
        Err(e) if e == "cancelled" => MilesDownloadProgress::new(depot, phase::CANCELLED),
        Err(e) => {
            let mut p = MilesDownloadProgress::new(depot, phase::ERROR);
            p.message = e;
            p
        }
    };
    let is_final = matches!(
        final_progress.phase.as_str(),
        phase::DONE | phase::ERROR | phase::CANCELLED
    );
    emit(&app, &final_progress);
    if let Ok(mut guard) = session_cell().lock() {
        if let Some(session) = guard.as_mut() {
            session.last = final_progress;
        }
        if is_final {
            *guard = None;
        }
    }
    release_download_gate();
}

async fn run_download_inner(
    app: &AppHandle,
    depot: u32,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    emit(app, &MilesDownloadProgress::new(depot, phase::CHECKING));

    let depot_dir =
        get_apex_depot_download_folder_path(depot as usize).ok_or("apex.milesDl.steamNotFound")?;
    // 进度统计以 depot 根目录为准（audio/ship 的上一级）
    let depot_root = depot_dir
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .unwrap_or(depot_dir.clone());

    ensure_cef_debugging(app, depot).await?;
    if cancel.load(Ordering::Relaxed) {
        return Err("cancelled".to_string());
    }

    let target = DownloadTarget {
        app_id: APEX_APP_ID,
        depot,
        depot_root,
    };
    let total_bytes = download_depot_via_cef(&target, cancel, &|downloaded, total| {
        let mut p = MilesDownloadProgress::new(depot, phase::DOWNLOADING);
        p.downloaded_bytes = downloaded;
        p.total_bytes = total;
        p.percent = if total > 0 {
            (downloaded as f64 / total as f64 * 100.0).min(99.0)
        } else {
            0.0
        };
        emit(app, &p);
    })
    .await?;

    emit(app, &MilesDownloadProgress::new(depot, phase::APPLYING));
    let depot_usize = depot as usize;
    blocking_cmd(move || copy_miles_language_to_game(depot_usize, Some("steam"), None)).await?;

    let mut p = MilesDownloadProgress::new(depot, phase::DONE);
    p.downloaded_bytes = total_bytes;
    p.total_bytes = total_bytes;
    p.percent = 100.0;
    emit(app, &p);
    Ok(())
}

/// 开始一键下载：立即返回，进度经 `apex-miles-download-progress` 事件推送。
#[tauri::command]
pub async fn start_apex_language_download(app: AppHandle, depot: u32) -> IpcResult<()> {
    if depot == 0 {
        return Err(IpcError::from_message("apex", "apex.milesDl.badDepot"));
    }
    steam_exe_path().map_err(|e| IpcError::from_message("apex", e))?;
    if apex_is_running_sync().map_err(|e| IpcError::from_message("apex", e))? {
        return Err(IpcError::from_message("apex", "apex.milesDl.apexRunning"));
    }

    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut guard = session_cell()
            .lock()
            .map_err(|_| IpcError::from_message("apex", "apex.milesDl.alreadyRunning"))?;
        if guard.is_some() {
            return Err(IpcError::from_message(
                "apex",
                "apex.milesDl.alreadyRunning",
            ));
        }
        if !try_acquire_download_gate().map_err(|e| IpcError::from_message("apex", e))? {
            return Err(IpcError::from_message(
                "apex",
                "apex.milesDl.alreadyRunning",
            ));
        }
        *guard = Some(DownloadSession {
            cancel: cancel.clone(),
            last: MilesDownloadProgress::new(depot, phase::CHECKING),
        });
    }

    tauri::async_runtime::spawn(run_download(app, depot, cancel));
    Ok(())
}

/// 取消下载；`stop_steam` 为 true 时同时退出 Steam 以中止其后台下载。
#[tauri::command]
pub async fn cancel_apex_language_download(stop_steam: bool) -> IpcResult<()> {
    let cancel = {
        let guard = session_cell()
            .lock()
            .map_err(|e| IpcError::from_message("apex", e.to_string()))?;
        guard.as_ref().map(|s| s.cancel.clone())
    };
    if let Some(cancel) = cancel {
        cancel.store(true, Ordering::Relaxed);
    }
    if stop_steam {
        if let Ok(exe) = steam_exe_path() {
            let _ = std::process::Command::new(&exe)
                .arg("-shutdown")
                .with_hidden_window()
                .spawn();
        }
    }
    Ok(())
}

/// 查询当前下载状态（对话框重新打开时恢复现场）。
#[tauri::command]
pub async fn get_apex_language_download_state() -> IpcResult<Option<MilesDownloadProgress>> {
    let guard = session_cell()
        .lock()
        .map_err(|e| IpcError::from_message("apex", e.to_string()))?;
    Ok(guard.as_ref().map(|s| s.last.clone()))
}

#[cfg(test)]
mod language_download_tests {
    use super::*;

    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/apex_language_download.rs"
    ));
}
