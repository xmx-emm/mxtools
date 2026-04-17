use std::time::Duration;
use tokio::time;
use std::process::Command;
use sysinfo::System;
use windows_tool::utils::CommandHiddenWindowExt;

static WAIT_MILLIS: u64 = 200; //等待毫秒数,避免数据刷新问题

pub async fn await_time() {
    time::sleep(Duration::from_millis(WAIT_MILLIS)).await;
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
