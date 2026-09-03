//! EA 版 Apex 语音包一键下载。
//!
//! 通过 CEF 调试端口调用 EA App 原生桥 `GamesManager.initiateLanguageChange`：
//! EA 切换游戏语言时会增量下载该语言的语音文件（直接落入游戏目录，无需复制），
//! 下载完成后再切回原语言。全程不操作 EA 窗口（我们拉起的会在就绪后最小化）。
//!
//! 桥接发现方式不依赖 webpack 模块号/导出名（EA 更新会变），按模块内容特征定位；
//! 每次运行做能力探测并记录 EAApp 版本，客户端更新导致桥变化时明确报错、回退手动流程。

use crate::cef_debug::{browser_version, list_targets, CefPage};
use crate::game::apex::apex_is_running_sync;
use crate::game::apex_language_download::{
    phase, release_download_gate, try_acquire_download_gate, MilesDownloadProgress,
    APEX_MILES_DOWNLOAD_EVENT,
};
use crate::ipc_error::{IpcError, IpcResult};
use crate::log_info;
use crate::utils::{kill_processes_by_names, ProcessNameMatchMode};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const EA_CEF_PORT: u16 = 9223;
const APEX_EA_OFFER_ID: &str = "Origin.OFR.50.0002694";

const EA_PORT_TIMEOUT: Duration = Duration::from_secs(150);
const BRIDGE_READY_TIMEOUT: Duration = Duration::from_secs(120);
/// 语言切换后等待安装动作开始的宽限（EULA 校验、空间分配等前置步骤可能较慢）
const CHANGE_ACK_TIMEOUT: Duration = Duration::from_secs(120);
const RESTORE_TIMEOUT: Duration = Duration::from_secs(300);
const STALL_TIMEOUT: Duration = Duration::from_secs(600);
const OVERALL_TIMEOUT: Duration = Duration::from_secs(90 * 60);

pub mod ea_phase {
    pub const RESTARTING_EA: &str = "restartingEa";
    pub const WAITING_EA: &str = "waitingEa";
    pub const SWITCHING: &str = "switchingLanguage";
    pub const RESTORING: &str = "restoringLanguage";
}

/// 桥定位 + 能力探测：按模块内容特征找 QWebChannel 模块，再用其「纯 getter」拿 channel。
/// 不依赖具体模块号与导出名。成功时把 GamesManager 挂到 window.__mxEaGames。
const BRIDGE_PROBE_JS: &str = r"(() => {
  if (typeof webpackChunk_eax_juno_web === 'undefined') return 'no-webpack';
  let req = null;
  try { webpackChunk_eax_juno_web.push([[Math.floor(Math.random() * 1e9)], [], (r) => { req = r; }]); }
  catch (e) { return 'no-req'; }
  if (!req || !req.m) return 'no-req';
  const mid = Object.keys(req.m).find((id) => {
    try { return String(req.m[id]).includes('webChannelTransport'); } catch (e) { return false; }
  });
  if (!mid) return 'no-channel-module';
  let mod;
  try { mod = req(Number(mid)); } catch (e) { return 'channel-module-err'; }
  for (const key of Object.keys(mod)) {
    let fn = mod[key];
    if (typeof fn !== 'function' || fn.length !== 0) continue;
    // 只调用「纯 getter」形态（()=>x），避开 connect 等有副作用的函数
    if (!/^\s*\(\s*\)\s*=>\s*[A-Za-z_$][\w$]*\s*$/.test(String(fn))) continue;
    try {
      const ch = fn();
      const games = ch && ch.objects && ch.objects.GamesManager;
      if (games && typeof games.initiateLanguageChange === 'function'
        && typeof games.getGameStatusV2 === 'function') {
        window.__mxEaGames = games;
        return 'ok';
      }
    } catch (e) {}
  }
  return 'bridge-not-ready';
})()";

const STATUS_JS: &str = r"(async () => {
  try { return JSON.stringify(await window.__mxEaGames.getGameStatusV2('Origin.OFR.50.0002694')); }
  catch (e) { return JSON.stringify({ error: String(e) }); }
})()";

const PROGRESS_SUB_JS: &str = r"(() => {
  if (!window.__mxEaDl) {
    window.__mxEaDl = [];
    try {
      window.__mxEaGames.downloadProgress.connect(function () {
        try {
          const parts = [];
          for (const a of arguments) {
            parts.push(typeof a === 'string' ? a : JSON.stringify(a));
          }
          window.__mxEaDl.push(parts.join(' '));
          if (window.__mxEaDl.length > 400) window.__mxEaDl.splice(0, 200);
        } catch (e) {}
      });
    } catch (e) {}
  }
  return 'ok';
})()";

const DRAIN_PROGRESS_JS: &str =
    r"window.__mxEaDl ? window.__mxEaDl.splice(0, window.__mxEaDl.length) : []";

fn language_change_js(slug: &str) -> String {
    format!(
        r"(async () => {{
  try {{
    const r = await window.__mxEaGames.initiateLanguageChange({{ offerId: '{APEX_EA_OFFER_ID}', trigger: 'mxtools', preferredLanguage: '{slug}' }});
    return JSON.stringify({{ ok: true, result: r == null ? null : String(r) }});
  }} catch (e) {{
    return JSON.stringify({{ error: String(e) }});
  }}
}})()",
    )
}

/// miles 语言标识 → EA 语言 slug（与 EA App 下拉数据一致）
fn ea_language_slug(miles_language: &str) -> Option<&'static str> {
    match miles_language
        .trim_matches('"')
        .to_ascii_lowercase()
        .as_str()
    {
        "english" => Some("en"),
        "french" => Some("fr"),
        "german" => Some("de"),
        "italian" => Some("it"),
        "japanese" => Some("ja"),
        "koreana" | "korean" => Some("ko"),
        "polish" => Some("pl"),
        "russian" => Some("ru"),
        "schinese" | "mandarin" => Some("zh-hans"),
        "spanish" => Some("es"),
        _ => None,
    }
}

/// EA slug ↔ installedLocale（桥 `Bi` 映射表）
fn ea_slug_to_locale(slug: &str) -> Option<&'static str> {
    match slug {
        "en" => Some("en_US"),
        "fr" => Some("fr_FR"),
        "de" => Some("de_DE"),
        "it" => Some("it_IT"),
        "ja" => Some("ja_JP"),
        "ko" => Some("ko_KR"),
        "pl" => Some("pl_PL"),
        "ru" => Some("ru_RU"),
        "zh-hans" => Some("zh_CN"),
        "es" => Some("es_ES"),
        _ => None,
    }
}

fn ea_locale_to_slug(locale: &str) -> Option<&'static str> {
    let pairs = [
        ("en_US", "en"),
        ("fr_FR", "fr"),
        ("de_DE", "de"),
        ("it_IT", "it"),
        ("ja_JP", "ja"),
        ("ko_KR", "ko"),
        ("pl_PL", "pl"),
        ("ru_RU", "ru"),
        ("zh_CN", "zh-hans"),
        ("es_ES", "es"),
    ];
    pairs.iter().find(|(l, _)| *l == locale).map(|(_, s)| *s)
}

struct EaDownloadSession {
    cancel: Arc<AtomicBool>,
    last: MilesDownloadProgress,
}

fn session_cell() -> &'static Mutex<Option<EaDownloadSession>> {
    static CELL: OnceLock<Mutex<Option<EaDownloadSession>>> = OnceLock::new();
    CELL.get_or_init(|| Mutex::new(None))
}

fn emit(app: &AppHandle, progress: &MilesDownloadProgress) {
    if let Ok(mut guard) = session_cell().lock() {
        if let Some(session) = guard.as_mut() {
            session.last = progress.clone();
        }
    }
    let _ = app.emit(APEX_MILES_DOWNLOAD_EVENT, progress);
}

fn ea_desktop_exe() -> Result<PathBuf, String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    let install_dir = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\WOW6432Node\Electronic Arts\EA Desktop")
        .and_then(|k| k.get_value::<String, _>("InstallLocation"))
        .map_err(|_| "apex.milesDlEa.eaNotFound".to_string())?;
    let exe = PathBuf::from(install_dir)
        .join("EA Desktop")
        .join("EADesktop.exe");
    if exe.is_file() {
        Ok(exe)
    } else {
        Err("apex.milesDlEa.eaNotFound".to_string())
    }
}

fn ea_process_running() -> bool {
    windows_tool::game::ea::ea_desktop_is_running_by_tasklist().unwrap_or(false)
}

const EA_CLIENT_PROCESS_NAMES: &[&str] = &[
    "eadesktop.exe",
    "ealauncher.exe",
    "eabackgroundagent.exe",
    "easteamproxy.exe",
    "link2ea.exe",
    "easervice.exe",
];

fn is_ea_client_process_name(name: &str) -> bool {
    EA_CLIENT_PROCESS_NAMES
        .iter()
        .any(|candidate| name.eq_ignore_ascii_case(candidate))
}

/// EA 启动的游戏通常是 Desktop/Launcher 进程树的非客户端后代。
/// 发现这种进程时不重启 EA，以免中断另一个游戏。
fn ea_other_game_running() -> bool {
    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let client_pids: std::collections::HashSet<_> = system
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            is_ea_client_process_name(&process.name().to_string_lossy()).then_some(*pid)
        })
        .collect();

    system.processes().iter().any(|(pid, process)| {
        if is_ea_client_process_name(&process.name().to_string_lossy()) {
            return false;
        }
        let mut parent = process.parent();
        while let Some(parent_pid) = parent {
            if client_pids.contains(&parent_pid) {
                return true;
            }
            parent = system
                .process(parent_pid)
                .and_then(sysinfo::Process::parent);
        }
        // A child can be re-parented after a launcher update.  It is not safe to
        // infer ownership in that case, so only positively identified descendants block.
        let _ = pid;
        false
    })
}

/// 最小化我们拉起的 EA 窗口（不影响用户体验）。
#[cfg(target_os = "windows")]
fn minimize_ea_window() {
    use winapi::shared::minwindef::{BOOL, LPARAM};
    use winapi::um::winuser::{
        EnumWindows, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible, ShowWindow,
        SW_MINIMIZE,
    };

    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let pids: Vec<u32> = system
        .processes()
        .values()
        .filter(|p| {
            p.name()
                .to_string_lossy()
                .eq_ignore_ascii_case("eadesktop.exe")
        })
        .map(|p| p.pid().as_u32())
        .collect();
    if pids.is_empty() {
        return;
    }

    struct Ctx {
        pids: *const Vec<u32>,
    }
    unsafe extern "system" fn callback(hwnd: winapi::shared::windef::HWND, lparam: LPARAM) -> BOOL {
        let ctx = &*(lparam as *const Ctx);
        let pids = &*ctx.pids;
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pids.contains(&pid) && IsWindowVisible(hwnd) != 0 && GetWindowTextLengthW(hwnd) > 0 {
            let _ = ShowWindow(hwnd, SW_MINIMIZE);
        }
        1
    }

    let ctx = Ctx { pids: &pids };
    unsafe {
        EnumWindows(Some(callback), &ctx as *const Ctx as LPARAM);
    }
}

#[cfg(not(target_os = "windows"))]
fn minimize_ea_window() {}

#[derive(serde::Serialize, serde::Deserialize)]
struct EaProbeRecord {
    user_agent: String,
    ok: bool,
    probed_at: String,
}

fn save_probe_record(user_agent: &str, ok: bool) {
    let Some(base) = std::env::var_os("APPDATA") else {
        return;
    };
    let path = PathBuf::from(base)
        .join("mxtools")
        .join("ea_cef_probe.json");
    if !ok {
        if let Ok(prev) = std::fs::read_to_string(&path) {
            if let Ok(record) = serde_json::from_str::<EaProbeRecord>(&prev) {
                if record.ok && record.user_agent != user_agent {
                    log_info!(
                        "EAApp 版本已变化: {} -> {}（桥探测失败，疑似客户端更新改动了内部结构）",
                        record.user_agent,
                        user_agent
                    );
                }
            }
        }
    }
    let record = EaProbeRecord {
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

/// 确保 EA App 以调试模式运行并返回页面会话；必要时杀进程重拉（含自更新丢参数的情形）。
async fn ensure_ea_debugging(app: &AppHandle) -> Result<CefPage, String> {
    // 已就绪：直接用
    if let Ok(page) = try_connect_ea_page().await {
        return Ok(page);
    }

    for attempt in 0..2 {
        // EA 在运行但没带调试端口（或自更新丢了参数）：重启它
        if ea_process_running() {
            if ea_other_game_running() {
                return Err("apex.milesDlEa.otherGameRunning".to_string());
            }
            emit(app, &MilesDownloadProgress::new(0, ea_phase::RESTARTING_EA));
            kill_processes_by_names(
                &[
                    "eadesktop.exe",
                    "ealauncher.exe",
                    "eabackgroundagent.exe",
                    "easteamproxy.exe",
                    "link2ea.exe",
                ],
                ProcessNameMatchMode::Exact,
            );
            tokio::time::sleep(Duration::from_secs(4)).await;
        }

        emit(app, &MilesDownloadProgress::new(0, ea_phase::WAITING_EA));
        let exe = ea_desktop_exe()?;
        std::process::Command::new(&exe)
            .arg(format!("--remote-debugging-port={EA_CEF_PORT}"))
            .spawn()
            .map_err(|e| format!("apex.milesDlEa.eaLaunchFailed: {e}"))?;

        // 等页面出现；若进程中途消失（自更新换实例丢参数）则下一轮重拉
        let deadline = Instant::now() + EA_PORT_TIMEOUT;
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            if let Ok(page) = try_connect_ea_page().await {
                minimize_ea_window();
                return Ok(page);
            }
            if Instant::now() > deadline {
                return Err("apex.milesDlEa.eaPortTimeout".to_string());
            }
            if !ea_process_running() {
                break;
            }
        }
        log_info!("EA 第 {} 次拉起后调试端口/页面未就绪, 重试", attempt + 1);
    }
    Err("apex.milesDlEa.eaPortTimeout".to_string())
}

async fn try_connect_ea_page() -> Result<CefPage, String> {
    let targets = list_targets(EA_CEF_PORT).await?;
    let Some(page_target) = targets
        .iter()
        .find(|t| t.kind == "page" && t.url.contains("pc.ea.com"))
        .and_then(|t| t.ws_url.clone())
    else {
        return Err("apex.milesDlEa.eaNoPage".to_string());
    };
    CefPage::connect(&page_target).await
}

/// 等待页面桥就绪（页面加载与 QWebChannel 连接是异步的），并做版本记录。
async fn wait_bridge_ready(page: &mut CefPage) -> Result<(), String> {
    let ua = browser_version(EA_CEF_PORT)
        .await
        .map(|v| v.user_agent)
        .unwrap_or_default();
    let deadline = Instant::now() + BRIDGE_READY_TIMEOUT;
    loop {
        let probe = page
            .evaluate(BRIDGE_PROBE_JS)
            .await
            .map_err(|e| format!("apex.milesDlEa.eaClientClosed: {e}"))?
            .as_str()
            .unwrap_or("bridge-not-ready")
            .to_string();
        match probe.as_str() {
            "ok" => {
                save_probe_record(&ua, true);
                log_info!("EA 桥探测通过, UA: {}", ua);
                return Ok(());
            }
            "bridge-not-ready" => {
                if Instant::now() > deadline {
                    save_probe_record(&ua, false);
                    return Err("apex.milesDlEa.eaBridgeTimeout".to_string());
                }
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
            // webpack 结构变了：硬错误，回退手动
            other => {
                save_probe_record(&ua, false);
                log_info!("EA 桥探测失败: {}, UA: {}", other, ua);
                return Err("apex.milesDlEa.eaBridgeChanged".to_string());
            }
        }
    }
}

struct EaGameStatus {
    installed: bool,
    installing: bool,
    updating: bool,
    playing: bool,
    update_required: bool,
    install_reason: String,
    install_status: String,
    installed_locale: String,
}

fn parse_status(value: &Value) -> Result<EaGameStatus, String> {
    let text = value.as_str().unwrap_or_default();
    let parsed: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    if let Some(error) = parsed.get("error") {
        return Err(format!("apex.milesDlEa.eaStatusFailed: {}", error));
    }
    let gs = &parsed["gameStatus"];
    let ii = &parsed["installInfo"];
    Ok(EaGameStatus {
        installed: gs["installed"].as_bool().unwrap_or(false),
        installing: gs["installing"].as_bool().unwrap_or(false),
        updating: gs["updating"].as_bool().unwrap_or(false),
        playing: gs["playing"].as_bool().unwrap_or(false),
        update_required: gs["updaterequired"].as_bool().unwrap_or(false),
        install_reason: ii["installReason"].as_str().unwrap_or_default().to_string(),
        install_status: ii["installStatusString"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        installed_locale: ii["installedLocale"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
    })
}

async fn read_status(page: &mut CefPage) -> Result<EaGameStatus, String> {
    let value = page.evaluate(STATUS_JS).await?;
    parse_status(&value)
}

/// 从 downloadProgress 信号负载里尽力解析字节进度。
fn parse_progress_payloads(items: &[String]) -> Option<(u64, u64)> {
    let mut latest = None;
    for item in items {
        // 负载可能是 JSON 对象/字符串，或带 offerId 前缀
        let candidates: Vec<&str> = item.splitn(2, ' ').collect();
        for c in candidates {
            let Ok(v) = serde_json::from_str::<Value>(c) else {
                continue;
            };
            let downloaded = v["bytesDownloaded"].as_u64();
            let total = v["bytesTotal"].as_u64();
            if let (Some(d), Some(t)) = (downloaded, total) {
                if t > 0 {
                    latest = Some((d, t));
                }
            }
        }
    }
    latest
}

async fn run_download(app: AppHandle, language: String, cancel: Arc<AtomicBool>) {
    let result = run_download_inner(&app, &language, &cancel).await;
    let final_progress = match result {
        Ok(()) => MilesDownloadProgress::new(0, phase::DONE),
        Err(e) if e == "cancelled" => MilesDownloadProgress::new(0, phase::CANCELLED),
        Err(e) => {
            let mut p = MilesDownloadProgress::new(0, phase::ERROR);
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
    language: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    let started = Instant::now();
    emit(app, &MilesDownloadProgress::new(0, phase::CHECKING));

    let target_slug = ea_language_slug(language).ok_or("apex.milesDlEa.badLanguage")?;
    let target_locale = ea_slug_to_locale(target_slug).ok_or("apex.milesDlEa.badLanguage")?;

    let mut page = ensure_ea_debugging(app).await?;
    wait_bridge_ready(&mut page).await?;
    if cancel.load(Ordering::Relaxed) {
        return Err("cancelled".to_string());
    }

    let status = read_status(&mut page).await?;
    if !status.installed {
        return Err("apex.milesDlEa.eaNotInstalled".to_string());
    }
    if status.playing {
        return Err("apex.milesDl.apexRunning".to_string());
    }
    // 有待完成的游戏更新时语言切换会被阻塞；且语音包必须匹配最新 build
    if status.update_required
        || (status.install_reason == "UPDATE" && status.install_status == "PAUSED")
    {
        return Err("apex.milesDlEa.eaUpdatePending".to_string());
    }
    if status.installed_locale == target_locale {
        log_info!("EA 端已是目标语言 {}, 无需下载", target_locale);
        return Ok(());
    }
    let restore_locale = status.installed_locale.clone();
    let restore_slug = ea_locale_to_slug(&restore_locale);

    page.evaluate(PROGRESS_SUB_JS).await?;

    emit(app, &MilesDownloadProgress::new(0, ea_phase::SWITCHING));
    let change_result = page.evaluate(&language_change_js(target_slug)).await?;
    if let Some(error) = change_result.get("error").and_then(|e| e.as_str()) {
        return Err(format!("apex.milesDlEa.eaChangeFailed: {error}"));
    }
    let change_issued_at = Instant::now();
    log_info!("EA 已发起语言切换 -> {}", target_slug);

    // 等下载完成：installedLocale 翻到目标语言且不在安装/更新中
    let mut last_bytes = 0u64;
    let mut last_growth = Instant::now();
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("cancelled".to_string());
        }
        if started.elapsed() > OVERALL_TIMEOUT {
            return Err("apex.milesDl.overallTimeout".to_string());
        }

        let drained = page
            .evaluate(DRAIN_PROGRESS_JS)
            .await?
            .as_array()
            .cloned()
            .unwrap_or_default();
        let items: Vec<String> = drained
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        if let Some((downloaded, total)) = parse_progress_payloads(&items) {
            if downloaded > last_bytes {
                last_bytes = downloaded;
                last_growth = Instant::now();
            }
            let mut p = MilesDownloadProgress::new(0, phase::DOWNLOADING);
            p.downloaded_bytes = downloaded;
            p.total_bytes = total;
            p.percent = (downloaded as f64 / total as f64 * 100.0).min(99.0);
            emit(app, &p);
        } else {
            // 无字节进度时也要让前端知道还活着
            emit(app, &MilesDownloadProgress::new(0, phase::DOWNLOADING));
        }

        let status = read_status(&mut page).await?;
        if status.install_status.contains("ERROR") || status.install_status.contains("FAILED") {
            return Err("apex.milesDlEa.eaDownloadFailed".to_string());
        }
        if status.installed_locale == target_locale && !status.installing && !status.updating {
            break;
        }
        if last_bytes == 0 && change_issued_at.elapsed() > CHANGE_ACK_TIMEOUT && !status.installing
        {
            // 切换未触发任何安装动作（可能被拒）
            return Err("apex.milesDlEa.eaChangeRejected".to_string());
        }
        if last_bytes > 0 && last_growth.elapsed() > STALL_TIMEOUT {
            return Err("apex.milesDl.downloadStalled".to_string());
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }

    // 切回原语言（文件已在本地，快速校验即可）
    if let Some(restore_slug) = restore_slug {
        if !restore_locale.is_empty() && restore_locale != target_locale {
            emit(app, &MilesDownloadProgress::new(0, ea_phase::RESTORING));
            let restore_result = page.evaluate(&language_change_js(restore_slug)).await;
            match restore_result {
                Ok(v) if v.get("error").is_none() => {
                    let deadline = Instant::now() + RESTORE_TIMEOUT;
                    loop {
                        if cancel.load(Ordering::Relaxed) {
                            return Err("cancelled".to_string());
                        }
                        if Instant::now() > deadline {
                            log_info!("EA 切回原语言超时（语音包已下载完成，可手动切回）");
                            break;
                        }
                        let status = read_status(&mut page).await?;
                        if status.installed_locale == restore_locale
                            && !status.installing
                            && !status.updating
                        {
                            break;
                        }
                        tokio::time::sleep(Duration::from_secs(2)).await;
                    }
                }
                Ok(v) => {
                    log_info!(
                        "EA 切回原语言被拒: {}（语音包已下载完成，可手动切回）",
                        v["error"].as_str().unwrap_or_default()
                    );
                }
                Err(e) => {
                    log_info!("EA 切回原语言失败: {}（语音包已下载完成，可手动切回）", e);
                }
            }
        }
    }

    let mut p = MilesDownloadProgress::new(0, phase::DONE);
    p.percent = 100.0;
    p.downloaded_bytes = last_bytes;
    emit(app, &p);
    Ok(())
}

/// 开始 EA 一键下载：立即返回，进度经 `apex-miles-download-progress` 事件推送。
#[tauri::command]
pub async fn start_apex_language_download_ea(app: AppHandle, language: String) -> IpcResult<()> {
    if ea_language_slug(&language).is_none() {
        return Err(IpcError::from_message("apex", "apex.milesDlEa.badLanguage"));
    }
    ea_desktop_exe().map_err(|e| IpcError::from_message("apex", e))?;
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
        *guard = Some(EaDownloadSession {
            cancel: cancel.clone(),
            last: MilesDownloadProgress::new(0, phase::CHECKING),
        });
    }

    tauri::async_runtime::spawn(run_download(app, language, cancel));
    Ok(())
}

/// 取消 EA 下载监控；`stop_ea` 为 true 时同时退出 EA App 以中止其后台下载。
#[tauri::command]
pub async fn cancel_apex_language_download_ea(stop_ea: bool) -> IpcResult<()> {
    let cancel = {
        let guard = session_cell()
            .lock()
            .map_err(|e| IpcError::from_message("apex", e.to_string()))?;
        guard.as_ref().map(|s| s.cancel.clone())
    };
    if let Some(cancel) = cancel {
        cancel.store(true, Ordering::Relaxed);
    }
    if stop_ea {
        kill_processes_by_names(
            &[
                "eadesktop.exe",
                "ealauncher.exe",
                "eabackgroundagent.exe",
                "easteamproxy.exe",
                "link2ea.exe",
            ],
            ProcessNameMatchMode::Exact,
        );
    }
    Ok(())
}

/// 查询当前 EA 下载状态（对话框重新打开时恢复现场）。
#[tauri::command]
pub async fn get_apex_language_download_state_ea() -> IpcResult<Option<MilesDownloadProgress>> {
    let guard = session_cell()
        .lock()
        .map_err(|e| IpcError::from_message("apex", e.to_string()))?;
    Ok(guard.as_ref().map(|s| s.last.clone()))
}

#[cfg(test)]
mod language_download_ea_tests {
    use super::*;

    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/apex_language_download_ea.rs"
    ));
}
