use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::{blocking_cmd, thoroughly_kill_named, ProcessNameMatchMode};
use windows_tool::game::steam::steam_is_running_by_tasklist as detect_steam_running_by_tasklist;
use windows_tool::game::steam::user::SteamUser;

/// 通过 `tasklist` 检测 `steam.exe` 进程(非注册表;注册表在强关 Steam 后不会更新).
#[tauri::command]
pub async fn steam_is_running_by_tasklist() -> IpcResult<bool> {
    blocking_cmd(detect_steam_running_by_tasklist)
        .await
        .map_err(|error| IpcError::operation_failed("steam", error))
}

#[tauri::command]
pub async fn get_steam_users() -> IpcResult<Vec<SteamUser>> {
    blocking_cmd(|| {
        use windows_tool::game::steam::user::get_steam_users as steam_users;
        steam_users()
    })
    .await
    .map_err(|error| IpcError::operation_failed("steam", error))
}

#[tauri::command]
pub async fn thoroughly_kill_steam() -> IpcResult<u32> {
    let target_processes = if cfg!(target_os = "windows") {
        vec!["steam.exe", "steamservice.exe", "steamwebhelper.exe"]
    } else if cfg!(target_os = "macos") {
        vec!["Steam", "steam_osx"]
    } else {
        vec!["steam", "steamwebhelper"]
    };
    thoroughly_kill_named("Steam", target_processes, ProcessNameMatchMode::Contains)
        .await
        .map_err(|error| IpcError::operation_failed("steam", error))
}
