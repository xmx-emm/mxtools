use crate::log_info;
use crate::utils::{await_time, kill_processes_by_names, ProcessNameMatchMode};
use windows_tool::game::steam::user::SteamUser;
use windows_tool::game::steam::{
    steam_is_running_by_tasklist as steam_running_by_tasklist_impl, steam_is_running_state_by_registry,
};

#[tauri::command]
pub fn steam_is_running() -> bool {
    steam_is_running_state_by_registry()
}

#[tauri::command]
pub async fn steam_is_running_by_tasklist() -> Result<bool, String> {
    steam_running_by_tasklist_impl()
}

#[tauri::command]
pub fn get_steam_users() -> Result<Vec<SteamUser>, String> {
    use windows_tool::game::steam::user::get_steam_users as steam_users;
    steam_users()
}

#[tauri::command]
pub async fn thoroughly_kill_steam() -> Result<(), ()> {
    log_info!("🔫 正在彻底强制关闭 Steam 及相关进程...");

    let target_processes = if cfg!(target_os = "windows") {
        vec!["steam.exe", "steamservice.exe", "steamwebhelper.exe"]
    } else if cfg!(target_os = "macos") {
        vec!["Steam", "steam_osx"]
    } else {
        vec!["steam", "steamwebhelper"]
    };

    let killed_count = kill_processes_by_names(&target_processes, ProcessNameMatchMode::Contains);

    if killed_count > 0 {
        log_info!("🎉 成功强制关闭了 {} 个 Steam 相关进程", killed_count);
    } else {
        log_info!("ℹ️ 未找到运行的 Steam 进程");
    }
    await_time().await;
    Ok(())
}
