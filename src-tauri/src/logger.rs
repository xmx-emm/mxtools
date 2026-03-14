//! 日志模块：后端/前端日志同时写入文件并输出到控制台

use std::env;
use std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::utils::{MAX_LOG_FILE_SIZE, OUTPUT_FOLDER_CATEGORIZE};
use windows_tool::utils::path::get_documents_path;

fn log_dir() -> Option<PathBuf> {
    // 多级回退：Documents -> exe目录 -> temp，确保有可用路径
    let docs = get_documents_path()
        .map(PathBuf::from)
        .or_else(|| env::var("USERPROFILE").ok().map(|p| PathBuf::from(p).join("Documents")));
    let docs = docs.or_else(|| {
        env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
    });
    let docs = docs.or_else(|| Some(env::temp_dir()));
    docs.map(|p| p.join(OUTPUT_FOLDER_CATEGORIZE))
}

static LOG_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

/// 初始化日志路径，并重定向 stdio 使所有 println!/eprintln! 同时输出到控制台和 backend.log
pub fn init_log_path() {
    if let Some(dir) = log_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("backend.log");
        if let Ok(mut guard) = LOG_PATH.lock() {
            *guard = Some(path.clone());
        }
        #[cfg(windows)]
        crate::stdio_tee::init(path, maybe_truncate_log);
    }
}

fn log_path() -> Option<PathBuf> {
    LOG_PATH.lock().ok().and_then(|g| g.clone())
}

/// 若文件超过 MAX_LOG_FILE_SIZE，保留后半部分
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

/// 格式化日志行
fn format_log_line(level: &str, message: &str) -> String {
    format!(
        "[{}] [{}] {}\n",
        now_iso(),
        level,
        message.replace('\n', " ")
    )
}

/// 统一写入：同时输出到控制台并追加到日志文件
/// 当 stdio 已重定向时，println!/eprintln! 会由 tee 线程写入文件，此处跳过直接写文件避免重复
fn write_to_console_and_file(path: Option<&PathBuf>, line: &str, level: &str) {
    // 1. 输出到控制台（stdio，若已重定向则 tee 会同时写入文件）
    match level {
        "ERROR" => eprintln!("{}", line.trim_end()),
        _ => println!("{}", line.trim_end()),
    }
    // 2. 若未启用 stdio 重定向，则直接追加到文件
    #[cfg(windows)]
    if crate::stdio_tee::is_active() {
        return;
    }
    if let Some(path) = path {
        maybe_truncate_log(path);
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
    }
}

/// 写入后端日志：控制台 + backend.log
pub fn log(level: &str, args: std::fmt::Arguments) {
    let msg = format!("{}", args);
    let line = format_log_line(level, &msg);
    let path = log_path().or_else(|| log_dir().map(|d| d.join("backend.log")));
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
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let ms = dur.subsec_millis();
    let (h, m, s) = ((secs / 3600) % 24, (secs / 60) % 60, secs % 60);
    format!("{:02}:{:02}:{:02}.{:03}", h, m, s, ms)
}

/// 前端调用：写入日志到 frontend.log
#[tauri::command]
pub fn write_frontend_log(level: String, message: String) {
    let line = format!(
        "[{}] [{}] {}\n",
        now_iso(),
        level,
        message.replace('\n', " ")
    );
    if let Some(log_dir) = log_dir() {
        let _ = std::fs::create_dir_all(&log_dir);
        let log_path = log_dir.join("frontend.log");
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
}

/// 读取日志内容用于反馈
#[tauri::command]
pub fn get_logs_for_feedback() -> Result<serde_json::Value, String> {
    let log_dir = log_dir().ok_or("无法获取日志目录")?;
    let backend_path = log_dir.join("backend.log");
    let frontend_path = log_dir.join("frontend.log");

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
        "backend": read_last_lines(&backend_path, 50),
        "frontend": read_last_lines(&frontend_path, 50)
    }))
}

/// 获取日志/文档文件夹路径
#[tauri::command]
pub fn get_log_folder_path() -> Result<String, String> {
    log_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "无法获取日志目录".to_string())
}
