//! 日志模块：后端/前端日志同时写入文件并输出到控制台
//!
//! 目录结构：`{OUTPUT_FOLDER_CATEGORIZE}/logs/YYYY-MM-DD/backend.log`(及 `frontend.log`).
//! 进程跨日时：将前一日目录内正在写入的 `*.log` 重命名为 `backend-YYYY-MM-DD.log` 等形式,再切换到新日期目录.
//! 超过 [`crate::utils::MAX_LOG_RETENTION_DAYS`] 的日期目录会被删除.

use std::env;
use std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use chrono::{Local, NaiveDate};
use windows_tool::utils::filesystem::get_documents_path;

use crate::utils::{
    MAX_LOG_FILE_SIZE, MAX_LOG_RETENTION_DAYS, OUTPUT_FOLDER_CATEGORIZE,
};

fn log_dir() -> Option<PathBuf> {
    let docs = get_documents_path().map(PathBuf::from).or_else(|| {
        env::var("USERPROFILE")
            .ok()
            .map(|p| PathBuf::from(p).join("Documents"))
    });
    let docs = docs.or_else(|| {
        env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
    });
    let docs = docs.or_else(|| Some(env::temp_dir()));
    docs.map(|p| p.join(OUTPUT_FOLDER_CATEGORIZE))
}

fn logs_root_under(base: &Path) -> PathBuf {
    base.join("logs")
}

fn local_date_str() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// 应用根目录下的 `logs` 路径(各天日志在其子目录中)
fn logs_root() -> Option<PathBuf> {
    log_dir().map(|p| logs_root_under(&p))
}

struct LogFileState {
    /// 当前正在写入的日历日(与 `logs/YYYY-MM-DD` 目录名一致)
    date: String,
    logs_root: PathBuf,
    backend_path: PathBuf,
    frontend_path: PathBuf,
}

static LOG_STATE: OnceLock<Arc<Mutex<LogFileState>>> = OnceLock::new();

fn prune_old_logs(logs_root: &Path) -> std::io::Result<()> {
    let Ok(entries) = std::fs::read_dir(logs_root) else {
        return Ok(());
    };
    let today = Local::now().date_naive();
    let max_days = i64::from(MAX_LOG_RETENTION_DAYS);
    for e in entries.flatten() {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        let name = e.file_name().to_string_lossy().to_string();
        let Ok(d) = NaiveDate::parse_from_str(&name, "%Y-%m-%d") else {
            continue;
        };
        let age_days = today.signed_duration_since(d).num_days();
        if age_days >= max_days {
            let _ = std::fs::remove_dir_all(&p);
        }
    }
    Ok(())
}

/// 将仍在写入的日志文件改名归档(保留在同一日期目录内)
fn archive_if_exists(old_file: &Path, role: &str, day_label: &str) -> std::io::Result<()> {
    if !old_file.exists() {
        return Ok(());
    }
    let Some(dir) = old_file.parent() else {
        return Ok(());
    };
    let target = dir.join(format!("{role}-{day_label}.log"));
    if target == old_file {
        return Ok(());
    }
    if !target.exists() {
        return std::fs::rename(old_file, &target);
    }
    let mut n = 1u32;
    loop {
        let t = dir.join(format!("{role}-{day_label}_{n}.log"));
        if !t.exists() {
            return std::fs::rename(old_file, &t);
        }
        n += 1;
        if n > 10_000 {
            return Ok(());
        }
    }
}

fn rotate_if_needed(state: &mut LogFileState) -> std::io::Result<()> {
    let today = local_date_str();
    if state.date == today {
        return Ok(());
    }

    let prev_date = state.date.clone();
    let old_backend = state.backend_path.clone();
    let old_frontend = state.frontend_path.clone();

    let new_dir = state.logs_root.join(&today);
    std::fs::create_dir_all(&new_dir)?;
    state.date = today;
    state.backend_path = new_dir.join("backend.log");
    state.frontend_path = new_dir.join("frontend.log");

    if !prev_date.is_empty() {
        let _ = archive_if_exists(&old_backend, "backend", &prev_date);
        let _ = archive_if_exists(&old_frontend, "frontend", &prev_date);
    }

    prune_old_logs(&state.logs_root)?;
    Ok(())
}

fn new_log_state(base_dir: &Path) -> std::io::Result<LogFileState> {
    let logs_root = logs_root_under(base_dir);
    std::fs::create_dir_all(&logs_root)?;
    prune_old_logs(&logs_root)?;

    let today = local_date_str();
    let day_dir = logs_root.join(&today);
    std::fs::create_dir_all(&day_dir)?;

    Ok(LogFileState {
        date: today,
        logs_root,
        backend_path: day_dir.join("backend.log"),
        frontend_path: day_dir.join("frontend.log"),
    })
}

fn with_rotated_state<T, F: FnOnce(&mut LogFileState) -> T>(f: F) -> Option<T> {
    let arc = LOG_STATE.get()?;
    let mut g = arc.lock().ok()?;
    let _ = rotate_if_needed(&mut *g);
    Some(f(&mut *g))
}

/// 未调用 `init_log_path` 时的兜底路径(仍使用按日目录)
fn fallback_backend_path() -> Option<PathBuf> {
    let base = log_dir()?;
    let _ = std::fs::create_dir_all(&base);
    let state = new_log_state(&base).ok()?;
    Some(state.backend_path)
}

fn fallback_frontend_path() -> Option<PathBuf> {
    let base = log_dir()?;
    let _ = std::fs::create_dir_all(&base);
    let state = new_log_state(&base).ok()?;
    Some(state.frontend_path)
}

/// 初始化日志路径,并重定向 stdio 使所有 println!/eprintln! 同时输出到控制台和 backend 日志
pub fn init_log_path() {
    if LOG_STATE.get().is_some() {
        return;
    }
    let Some(base) = log_dir() else {
        return;
    };
    let _ = std::fs::create_dir_all(&base);

    let state = match new_log_state(&base) {
        Ok(s) => s,
        Err(_) => return,
    };

    let arc = Arc::new(Mutex::new(state));
    if LOG_STATE.set(arc.clone()).is_err() {
        return;
    }

    let get_path = {
        let a = arc.clone();
        Arc::new(move || {
            let mut g = a.lock().unwrap();
            let _ = rotate_if_needed(&mut *g);
            g.backend_path.clone()
        })
    };

    #[cfg(windows)]
    crate::stdio_tee::init(get_path, maybe_truncate_log);
}

fn backend_path_for_write() -> Option<PathBuf> {
    with_rotated_state(|s| s.backend_path.clone()).or_else(fallback_backend_path)
}

fn frontend_path_for_write() -> Option<PathBuf> {
    with_rotated_state(|s| s.frontend_path.clone()).or_else(fallback_frontend_path)
}

/// 若文件超过 MAX_LOG_FILE_SIZE,保留后半部分
pub(crate) fn maybe_truncate_log(path: &Path) {
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() >= MAX_LOG_FILE_SIZE {
            let keep = (MAX_LOG_FILE_SIZE / 2) as usize;
            if let Ok(mut f) = std::fs::File::open(path) {
                if f.seek(SeekFrom::End(-(keep as i64))).is_ok() {
                    let mut buf = vec![0u8; keep];
                    if f.read_exact(&mut buf).is_ok() {
                        let _ = std::fs::write(path, buf);
                    }
                }
            }
        }
    }
}

fn format_log_line(level: &str, message: &str) -> String {
    format!(
        "[{}] [{}] {}\n",
        now_iso(),
        level,
        message.replace('\n', " ")
    )
}

fn write_to_console_and_file(path: Option<&PathBuf>, line: &str, level: &str) {
    match level {
        "ERROR" => eprintln!("{}", line.trim_end()),
        _ => println!("{}", line.trim_end()),
    }
    #[cfg(windows)]
    if crate::stdio_tee::is_active() {
        return;
    }
    if let Some(path) = path {
        maybe_truncate_log(path);
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
    }
}

/// 写入后端日志：控制台 + 按日目录下的 backend.log
pub fn log(level: &str, args: std::fmt::Arguments) {
    let msg = format!("{}", args);
    let line = format_log_line(level, &msg);
    let path = backend_path_for_write();
    write_to_console_and_file(path.as_ref(), &line, level);
}

#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => { $crate::logger::log("INFO", format_args!($($arg)*)) };
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => { $crate::logger::log("ERROR", format_args!($($arg)*)) };
}

#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => { $crate::logger::log("DEBUG", format_args!($($arg)*)) };
}

fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let ms = dur.subsec_millis();
    let (h, m, s) = ((secs / 3600) % 24, (secs / 60) % 60, secs % 60);
    format!("{:02}:{:02}:{:02}.{:03}", h, m, s, ms)
}

/// 前端调用：写入日志到按日目录下的 frontend.log
#[tauri::command]
pub fn write_frontend_log(level: String, message: String) {
    let line = format!(
        "[{}] [{}] {}\n",
        now_iso(),
        level,
        message.replace('\n', " ")
    );
    let Some(log_path) = frontend_path_for_write() else {
        return;
    };
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    maybe_truncate_log(&log_path);
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = file.write_all(line.as_bytes());
        let _ = file.flush();
    }
}

/// 读取日志内容用于反馈
#[tauri::command]
pub fn get_logs_for_feedback() -> Result<serde_json::Value, String> {
    let backend_path = with_rotated_state(|s| s.backend_path.clone())
        .or_else(fallback_backend_path)
        .ok_or_else(|| "无法获取日志目录".to_string())?;
    let frontend_path = with_rotated_state(|s| s.frontend_path.clone())
        .or_else(fallback_frontend_path)
        .ok_or_else(|| "无法获取日志目录".to_string())?;

    fn read_last_lines(path: &std::path::Path, max_lines: usize) -> String {
        std::fs::read_to_string(path)
            .map(|s| {
                let lines: Vec<&str> = s.lines().collect();
                let start = lines.len().saturating_sub(max_lines);
                lines[start..].join("\n")
            })
            .unwrap_or_else(|_| "(无日志)".to_string())
    }

    Ok(serde_json::json!({
        "backend": read_last_lines(&backend_path, 5),
        "frontend": read_last_lines(&frontend_path, 5)
    }))
}

/// 获取日志根目录(`…/mxtools/logs`,其下为各日期的子文件夹)
#[tauri::command]
pub fn get_log_folder_path() -> Result<String, String> {
    logs_root()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "无法获取日志目录".to_string())
}
