//! Tauri 封装；实现位于 `windows_tool::game::ea`.

use crate::game::apex_history::{
    discard_scope_locked_for_app, lock_history, prune_history_locked, record_launch_before_locked,
    ApexConfigScope, ApexHistorySource, ApexLauncherRef,
};
use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::{blocking_cmd, thoroughly_kill_named, ProcessNameMatchMode};
use windows_tool::game::ea::{self, EaDesktopUser};

pub(crate) fn read_ea_launch_options(ea_user_id: &str) -> Result<String, String> {
    ea::get_apex_launch_option_ea(ea_user_id)
}

pub(crate) fn write_ea_launch_options(ea_user_id: &str, value: &str) -> Result<(), String> {
    crate::game::apex::validate_launch_options(value)?;
    ea::set_apex_launch_option_ea(ea_user_id, value)
}

pub(crate) fn ea_desktop_is_running_sync() -> Result<bool, String> {
    ea::ea_desktop_is_running_by_tasklist()
}

#[tauri::command]
pub async fn get_ea_desktop_users() -> IpcResult<Vec<EaDesktopUser>> {
    blocking_cmd(ea::get_ea_desktop_users)
        .await
        .map_err(|error| IpcError::operation_failed("ea_desktop", error))
}

#[tauri::command]
pub async fn get_apex_launch_option_ea(ea_user_id: String) -> IpcResult<String> {
    blocking_cmd(move || read_ea_launch_options(&ea_user_id))
        .await
        .map_err(|error| IpcError::operation_failed("ea_desktop", error))
}

#[tauri::command]
pub async fn set_apex_launch_option_ea(
    app: tauri::AppHandle,
    ea_user_id: String,
    launch_option: String,
    history_source: Option<ApexHistorySource>,
    transaction_id: Option<String>,
) -> IpcResult<()> {
    blocking_cmd(move || {
        crate::game::apex::validate_launch_options(&launch_option)?;
        let _guard = lock_history()?;
        let current = read_ea_launch_options(&ea_user_id)?;
        if current == launch_option {
            return Ok(());
        }
        if ea_desktop_is_running_sync()? {
            return Err("apex.history.errors.launcherRunning".to_string());
        }
        let entry = record_launch_before_locked(
            &app,
            history_source.unwrap_or_default(),
            transaction_id.as_deref(),
            ApexLauncherRef {
                kind: "ea".to_string(),
                id: ea_user_id.clone(),
                name: String::new(),
            },
            current.clone(),
        )?;
        if let Err(error) = write_ea_launch_options(&ea_user_id, &launch_option) {
            let unchanged = read_ea_launch_options(&ea_user_id)
                .map(|after| after == current)
                .unwrap_or(false);
            if unchanged && entry.scope_added {
                let _ =
                    discard_scope_locked_for_app(&app, &entry.entry.id, ApexConfigScope::Launch);
            }
            return Err(error);
        }
        let _ = prune_history_locked(&app);
        Ok(())
    })
    .await
    .map_err(|error| IpcError::operation_failed("ea_desktop", error))
}

#[tauri::command]
pub async fn ea_desktop_is_running_by_tasklist() -> IpcResult<bool> {
    #[cfg(target_os = "windows")]
    {
        blocking_cmd(ea_desktop_is_running_sync)
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
