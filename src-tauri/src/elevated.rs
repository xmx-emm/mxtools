use crate::ipc_error::{IpcError, IpcResult};
use windows_tool::elevated::{
    is_elevated as windows_is_elevated, request_restart_with_privileges_elevate,
};

/// 返回是否有管理员权限
#[tauri::command]
pub fn is_elevated() -> bool {
    windows_is_elevated()
}

/// 特权命令统一门控：未提升时返回 Err，避免仅靠前端禁用。
pub fn require_elevated() -> Result<(), String> {
    if windows_is_elevated() {
        Ok(())
    } else {
        Err("elevation.needAdmin".to_string())
    }
}

/// 提升权限并重启。成功后始终退出当前进程，避免 debug 下双实例并存、横幅不消失。
#[tauri::command]
pub fn restart_request_elevation() -> IpcResult<()> {
    request_restart_with_privileges_elevate(true, true)
        .map_err(|error| IpcError::operation_failed("elevation", error.to_string()))
}
