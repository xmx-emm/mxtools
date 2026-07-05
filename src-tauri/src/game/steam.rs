use crate::log_info;
use crate::utils::{await_time, blocking_cmd, kill_processes_by_names, ProcessNameMatchMode};
use windows_tool::game::steam::steam_is_running_by_tasklist as detect_steam_running_by_tasklist;
use windows_tool::game::steam::user::SteamUser;

#[tauri::command]
pub async fn steam_is_running() -> Result<bool, String> {
    blocking_cmd(detect_steam_running_by_tasklist).await
}

/// 通过 `tasklist` 检测 `steam.exe` 进程(非注册表;注册表在强关 Steam 后不会更新).
#[tauri::command]
pub async fn steam_is_running_by_tasklist() -> Result<bool, String> {
    blocking_cmd(detect_steam_running_by_tasklist).await
}

#[tauri::command]
pub async fn get_steam_users() -> Result<Vec<SteamUser>, String> {
    blocking_cmd(|| {
        use windows_tool::game::steam::user::get_steam_users as steam_users;
        steam_users()
    })
    .await
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

    let killed_count = tokio::task::spawn_blocking(move || {
        kill_processes_by_names(&target_processes, ProcessNameMatchMode::Contains)
    })
    .await
    .unwrap_or(0);

    if killed_count > 0 {
        log_info!("🎉 成功强制关闭了 {} 个 Steam 相关进程", killed_count);
    } else {
        log_info!("ℹ️ 未找到运行的 Steam 进程");
    }
    await_time().await;
    Ok(())
}
