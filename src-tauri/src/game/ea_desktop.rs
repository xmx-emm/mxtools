//! Tauri 封装；实现位于 `windows_tool::game::ea`.

use crate::log_info;
use crate::utils::{await_time, blocking_cmd, kill_processes_by_names, ProcessNameMatchMode};
use windows_tool::game::ea::{self, EaDesktopUser};

#[tauri::command]
pub async fn get_ea_desktop_users() -> Result<Vec<EaDesktopUser>, String> {
    blocking_cmd(ea::get_ea_desktop_users).await
}

#[tauri::command]
pub async fn get_apex_launch_option_ea(ea_user_id: String) -> Result<String, String> {
    blocking_cmd(move || ea::get_apex_launch_option_ea(&ea_user_id)).await
}

#[tauri::command]
pub async fn set_apex_launch_option_ea(
    ea_user_id: String,
    launch_option: String,
) -> Result<(), String> {
    blocking_cmd(move || ea::set_apex_launch_option_ea(&ea_user_id, &launch_option)).await
}

#[tauri::command]
pub async fn ea_desktop_is_running_by_tasklist() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        blocking_cmd(ea::ea_desktop_is_running_by_tasklist).await
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// 强制结束 EA Desktop 及相关进程,便于写入 `user_*.ini` 启动项.
#[tauri::command]
pub async fn thoroughly_kill_ea_desktop() -> Result<(), ()> {
    log_info!("正在关闭 EA Desktop 及相关进程...");

    let target_processes = if cfg!(target_os = "windows") {
        vec![
            "eadesktop.exe",
            "ealauncher.exe",
            "eabackgroundagent.exe",
            "easteamproxy.exe",
            "link2ea.exe",
        ]
    } else {
        vec![]
    };

    let killed_count = tokio::task::spawn_blocking(move || {
        kill_processes_by_names(&target_processes, ProcessNameMatchMode::Exact)
    })
    .await
    .unwrap_or(0);

    if killed_count > 0 {
        log_info!("已关闭 {} 个 EA 相关进程", killed_count);
    } else {
        log_info!("未找到运行中的 EA 相关进程");
    }
    await_time().await;
    Ok(())
}
