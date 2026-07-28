use std::process::Command;
use std::time::Duration;
use sysinfo::System;
use tokio::time;
use windows_tool::utils::CommandHiddenWindowExt;

static WAIT_MILLIS: u64 = 200; //等待毫秒数,避免数据刷新问题
static POLL_INTERVAL_MS: u64 = 100;
static POLL_ATTEMPTS: u32 = 20; // 最多约 2s

pub async fn await_time() {
    time::sleep(Duration::from_millis(WAIT_MILLIS)).await;
}

/// 轮询直到 `pred` 为真或达到尝试次数；返回最后一次 `pred` 的结果。
pub async fn poll_until<F>(mut pred: F) -> bool
where
    F: FnMut() -> bool,
{
    for i in 0..POLL_ATTEMPTS {
        if pred() {
            return true;
        }
        if i + 1 < POLL_ATTEMPTS {
            time::sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
        }
    }
    pred()
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

pub fn kill_processes_by_names(
    target_processes: &[&str],
    match_mode: ProcessNameMatchMode,
) -> usize {
    if target_processes.is_empty() {
        return 0;
    }

    let target_lower: Vec<String> = target_processes
        .iter()
        .map(|name| name.to_lowercase())
        .collect();

    // 仅刷新进程列表，避免 System::new_all + refresh_all 的全量开销
    let mut system = System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

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

/// 强制结束一组进程并等待短暂刷新；返回终止数量。
pub async fn thoroughly_kill_named(
    label: &str,
    target_processes: Vec<&'static str>,
    match_mode: ProcessNameMatchMode,
) -> Result<u32, String> {
    crate::log_info!("正在强制关闭 {} ...", label);
    let killed_count =
        tokio::task::spawn_blocking(move || kill_processes_by_names(&target_processes, match_mode))
            .await
            .map_err(|e| e.to_string())?;

    if killed_count > 0 {
        crate::log_info!("已关闭 {} 个 {} 相关进程", killed_count, label);
    } else {
        crate::log_info!("未找到运行中的 {} 进程", label);
    }
    await_time().await;
    Ok(killed_count as u32)
}

/// 输入文件夹路径分类,备份注册表及日志类的目录
pub static OUTPUT_FOLDER_CATEGORIZE: &str = "mxtools";

/// 单个日志文件最大大小(字节),超过时保留后半部分
pub const MAX_LOG_FILE_SIZE: u64 = 500 * 1024; // 500KB

/// 按日期分目录保存日志时,保留最近多少个「日历日」的目录；更早的 `logs/YYYY-MM-DD/` 会被删除
pub const MAX_LOG_RETENTION_DAYS: u32 = 30;
