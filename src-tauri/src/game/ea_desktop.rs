//! Tauri 封装；实现位于 `windows_tool::game::ea`.

use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::{blocking_cmd, thoroughly_kill_named, ProcessNameMatchMode};
use windows_tool::game::ea::{self, EaDesktopUser};

#[tauri::command]
pub async fn get_ea_desktop_users() -> IpcResult<Vec<EaDesktopUser>> {
    blocking_cmd(ea::get_ea_desktop_users)
        .await
        .map_err(|error| IpcError::operation_failed("ea_desktop", error))
}

#[tauri::command]
pub async fn get_apex_launch_option_ea(ea_user_id: String) -> IpcResult<String> {
    blocking_cmd(move || ea::get_apex_launch_option_ea(&ea_user_id))
        .await
        .map_err(|error| IpcError::operation_failed("ea_desktop", error))
}

#[tauri::command]
pub async fn set_apex_launch_option_ea(ea_user_id: String, launch_option: String) -> IpcResult<()> {
    blocking_cmd(move || ea::set_apex_launch_option_ea(&ea_user_id, &launch_option))
        .await
        .map_err(|error| IpcError::operation_failed("ea_desktop", error))
}

#[tauri::command]
pub async fn ea_desktop_is_running_by_tasklist() -> IpcResult<bool> {
    #[cfg(target_os = "windows")]
    {
        blocking_cmd(ea::ea_desktop_is_running_by_tasklist)
            .await
            .map_err(|error| IpcError::operation_failed("ea_desktop", error))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// 强制结束 EA Desktop 及相关进程,便于写入 `user_*.ini` 启动项.
#[tauri::command]
pub async fn thoroughly_kill_ea_desktop() -> IpcResult<u32> {
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
    thoroughly_kill_named("EA Desktop", target_processes, ProcessNameMatchMode::Exact)
        .await
        .map_err(|error| IpcError::operation_failed("ea_desktop", error))
}
