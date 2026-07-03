use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::time;
use std::process::Command;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};
use windows_tool::utils::CommandHiddenWindowExt;

static WAIT_MILLIS: u64 = 200; //等待毫秒数,避免数据刷新问题

static PROCESS_SCAN_SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();

struct RunningScanCacheEntry {
    result: bool,
    at: Instant,
}

static RUNNING_SCAN_CACHE: OnceLock<Mutex<HashMap<String, RunningScanCacheEntry>>> = OnceLock::new();
static LAST_PROCESS_TABLE_REFRESH: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
const RUNNING_SCAN_CACHE_TTL: Duration = Duration::from_secs(45);
const PROCESS_TABLE_REFRESH_MIN_INTERVAL: Duration = Duration::from_secs(30);

fn running_scan_cache() -> &'static Mutex<HashMap<String, RunningScanCacheEntry>> {
    RUNNING_SCAN_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn process_scan_system() -> &'static Mutex<System> {
    PROCESS_SCAN_SYSTEM.get_or_init(|| {
        Mutex::new(System::new_with_specifics(
            RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
        ))
    })
}

pub async fn await_time() {
    time::sleep(Duration::from_millis(WAIT_MILLIS)).await;
}

/// 在阻塞线程池执行可能耗时的同步操作，避免卡住 Tauri 主运行时。
pub async fn blocking_cmd<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// 在阻塞线程池执行无 Result 包装的同步操作。
pub async fn blocking_value<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Clone, Copy)]
pub enum ProcessNameMatchMode {
    Exact,
    Contains,
}

fn force_kill_process_by_pid(pid: String) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .with_hidden_window()
            .args(["/f", "/pid", &pid])
            .output();
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        let _ = Command::new("kill").args(["-9", &pid]).output();
    }
}

/// 单次遍历进程表,判断是否有任一目标进程在运行(避免多次 `tasklist` 子进程).
pub fn is_any_named_process_running(names: &[&str]) -> bool {
    if names.is_empty() {
        return false;
    }
    let cache_key = names.join("\0");
    if let Ok(cache) = running_scan_cache().lock() {
        if let Some(entry) = cache.get(&cache_key) {
            if entry.at.elapsed() < RUNNING_SCAN_CACHE_TTL {
                return entry.result;
            }
        }
    }
    let result = is_any_named_process_running_uncached(names);
    if let Ok(mut cache) = running_scan_cache().lock() {
        cache.insert(
            cache_key,
            RunningScanCacheEntry {
                result,
                at: Instant::now(),
            },
        );
    }
    result
}

fn refresh_process_table_if_stale(system: &mut System) {
    let last_refresh = LAST_PROCESS_TABLE_REFRESH.get_or_init(|| Mutex::new(None));
    let stale = last_refresh
        .lock()
        .map(|t| t.map(|at| at.elapsed() >= PROCESS_TABLE_REFRESH_MIN_INTERVAL).unwrap_or(true))
        .unwrap_or(true);
    if !stale {
        return;
    }
    system.refresh_processes(ProcessesToUpdate::All, false);
    if let Ok(mut t) = last_refresh.lock() {
        *t = Some(Instant::now());
    }
}

fn is_any_named_process_running_uncached(names: &[&str]) -> bool {
    if names.is_empty() {
        return false;
    }
    let targets: Vec<String> = names.iter().map(|n| n.to_ascii_lowercase()).collect();
    let mut system = process_scan_system()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    refresh_process_table_if_stale(&mut system);
    system.processes().values().any(|process| {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        targets.iter().any(|t| name == *t)
    })
}

/// Steam 主进程是否在运行(与原先 `tasklist /FI steam.exe` 一致,强关后可正确变为 false).
pub const STEAM_RUNNING_PROCESS_NAMES: &[&str] = &["steam.exe"];

pub fn is_steam_running_by_process_scan() -> bool {
    is_any_named_process_running(STEAM_RUNNING_PROCESS_NAMES)
}

/// EA Desktop 相关进程是否在运行.
pub const EA_DESKTOP_RUNNING_PROCESS_NAMES: &[&str] = &[
    "EADesktop.exe",
    "EALauncher.exe",
    "EABackgroundAgent.exe",
    "EASteamProxy.exe",
];

pub fn is_ea_desktop_running_by_process_scan() -> bool {
    is_any_named_process_running(EA_DESKTOP_RUNNING_PROCESS_NAMES)
}

pub fn kill_processes_by_names(target_processes: &[&str], match_mode: ProcessNameMatchMode) -> usize {
    if target_processes.is_empty() {
        return 0;
    }

    let target_lower: Vec<String> = target_processes.iter().map(|name| name.to_lowercase()).collect();

    let mut system = System::new_all();
    system.refresh_all();

    let mut killed_count = 0;

    for (pid, process) in system.processes() {
        let process_name = process.name().to_string_lossy().to_ascii_lowercase();

        let matched = target_lower.iter().any(|target| match match_mode {
            ProcessNameMatchMode::Exact => process_name == *target,
            ProcessNameMatchMode::Contains => process_name.contains(target),
        });

        if !matched {
            continue;
        }

        crate::log_info!("找到匹配进程: {:?} (PID: {})", process.name(), pid);

        if process.kill() {
            crate::log_info!("已终止: {:?}", process.name());
            killed_count += 1;
            continue;
        }

        force_kill_process_by_pid(pid.to_string());
    }

    killed_count
}

/// 输入文件夹路径分类,备份注册表及日志类的目录
pub static OUTPUT_FOLDER_CATEGORIZE: &str = "mxtools";

/// 单个日志文件最大大小(字节),超过时保留后半部分
pub const MAX_LOG_FILE_SIZE: u64 = 500 * 1024; // 500KB

/// 按日期分目录保存日志时,保留最近多少个「日历日」的目录；更早的 `logs/YYYY-MM-DD/` 会被删除
pub const MAX_LOG_RETENTION_DAYS: u32 = 30;
