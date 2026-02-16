use windows_tool::elevated::{
    is_elevated as windows_is_elevated, request_restart_with_privileges_elevate,
};

///反回是否有管理员权限
#[tauri::command]
pub fn is_elevated() -> bool {
    windows_is_elevated()
}

///提升权限
#[tauri::command]
pub fn restart_request_elevation() {
    let is_debug = cfg!(debug_assertions);
    request_restart_with_privileges_elevate(false, !is_debug);
}
