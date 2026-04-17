//! Tauri 封装；实现位于 `windows_tool::game::ea`.

use crate::log_info;
use crate::utils::{await_time, kill_processes_by_names, ProcessNameMatchMode};
use windows_tool::game::ea::{self, EaDesktopUser};

#[tauri::command]
pub fn get_ea_desktop_users() -> Result<Vec<EaDesktopUser>, String> {
    ea::get_ea_desktop_users()
}

#[tauri::command]
pub fn get_apex_launch_option_ea(ea_user_id: String) -> Result<String, String> {
    ea::get_apex_launch_option_ea(&ea_user_id)
}

#[tauri::command]
pub fn set_apex_launch_option_ea(ea_user_id: String, launch_option: String) -> Result<(), String> {
    ea::set_apex_launch_option_ea(&ea_user_id, &launch_option)
}

#[tauri::command]
pub async fn ea_desktop_is_running_by_tasklist() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        return ea::ea_desktop_is_running_by_tasklist();
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

    let killed_count = kill_processes_by_names(&target_processes, ProcessNameMatchMode::Exact);

    if killed_count > 0 {
        log_info!("已关闭 {} 个 EA 相关进程", killed_count);
    } else {
        log_info!("未找到运行中的 EA 相关进程");
    }
    await_time().await;
    Ok(())
}
