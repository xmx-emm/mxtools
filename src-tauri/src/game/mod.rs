use crate::utils::await_time;
use std::process::Command;
use sysinfo::System;
use windows_tool::steam::steam_is_running_state_by_registry;
use windows_tool::steam::user::SteamUser;
use windows_tool::utils::run_commands;

pub mod apex;

#[tauri::command]
pub fn steam_is_running() -> bool {
    steam_is_running_state_by_registry()
}

#[tauri::command]
pub async fn steam_is_running_by_tasklist() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let output = run_commands(
            "tasklist /fi \"imagename eq steam.exe\" /fo csv",
            true,
            false,
        );
        let output_str = String::from_utf8_lossy(&output.stdout);
        return Ok(output_str.contains("steam.exe"));
    }
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        return match Command::new("pgrep").arg("steam").output() {
            Ok(output) => Ok(output.status.success()),
            Err(error) => Err(error.to_string()),
        };
    }
}

#[tauri::command]
pub fn get_steam_users() -> Result<Vec<SteamUser>, String> {
    use windows_tool::steam::user::get_steam_users as steam_users;
    steam_users()
}

#[tauri::command]
pub async fn thoroughly_kill_steam() -> Result<(), ()> {
    println!("🔫 正在彻底强制关闭 Steam 及相关进程...");

    let mut system = System::new_all();
    system.refresh_all();

    let target_processes = if cfg!(target_os = "windows") {
        vec!["steam.exe", "steamservice.exe", "steamwebhelper.exe"]
    } else if cfg!(target_os = "macos") {
        vec!["Steam", "steam_osx"]
    } else {
        vec!["steam", "steamwebhelper"]
    };

    let mut killed_count = 0;

    for (pid, process) in system.processes() {
        let process_name = process
            .name()
            .to_ascii_lowercase()
            .to_str()
            .unwrap()
            .to_string();

        for target in &target_processes {
            if process_name.contains(&target.to_lowercase()) {
                println!(
                    "🎯 找到 Steam 相关进程: {:?} (PID: {})",
                    process.name(),
                    pid
                );

                // 强制终止进程
                if process.kill() {
                    println!("✅ 已终止: {:?}", process.name());
                    killed_count += 1;
                } else {
                    println!("❌ 终止失败: {:?}", process.name());

                    // 如果标准方法失败，使用系统命令强制终止
                    #[cfg(target_os = "windows")]
                    {
                        let _ = Command::new("taskkill")
                            .args(&["/f", "/pid", &pid.to_string()])
                            .output();
                    }

                    #[cfg(any(target_os = "linux", target_os = "macos"))]
                    {
                        let _ = std::process::Command::new("kill")
                            .args(&["-9", &pid.to_string()])
                            .output();
                    }
                }
            }
        }
    }

    if killed_count > 0 {
        println!("🎉 成功强制关闭了 {} 个 Steam 相关进程", killed_count);
    } else {
        println!("ℹ️ 未找到运行的 Steam 进程");
    }
    await_time().await;
    Ok(())
}
