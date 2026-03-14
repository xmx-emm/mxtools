use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowsUser {
    pub name: String,
    pub is_rdp_user: bool,
}

pub fn run_cmd(args: &[&str]) -> Result<String, String> {
    let output = Command::new("cmd")
        .args(["/C"])
        .args(args)
        .output()
        .map_err(|e| format!("执行命令失败: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

pub fn run_powershell(script: &str) -> Result<String, String> {
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| format!("执行PowerShell失败: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(stderr)
    }
}

pub fn parse_user_list_from_net_user(output: &str) -> Vec<String> {
    let mut users = Vec::new();
    let mut in_user_section = false;

    for line in output.lines() {
        if line.starts_with("---") {
            in_user_section = true;
            continue;
        }
        if in_user_section {
            if line.starts_with("The command completed") || line.trim().is_empty() {
                break;
            }
            for name in line.split_whitespace() {
                let trimmed = name.trim();
                if !trimmed.is_empty() {
                    users.push(trimmed.to_string());
                }
            }
        }
    }
    users
}

pub fn parse_group_members(output: &str) -> Vec<String> {
    let mut members = Vec::new();
    let mut in_member_section = false;

    for line in output.lines() {
        if line.starts_with("---") {
            in_member_section = true;
            continue;
        }
        if in_member_section {
            if line.starts_with("The command completed") || line.trim().is_empty() {
                break;
            }
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                members.push(trimmed.to_string());
            }
        }
    }
    members
}

#[tauri::command]
pub fn get_windows_users() -> Result<Vec<WindowsUser>, String> {
    let user_output = run_cmd(&["net", "user"])?;
    let all_users = parse_user_list_from_net_user(&user_output);

    let rdp_output = run_cmd(&["net", "localgroup", "Remote Desktop Users"]);
    let rdp_users = match rdp_output {
        Ok(out) => parse_group_members(&out),
        Err(_) => Vec::new(),
    };

    let rdp_lower: Vec<String> = rdp_users.iter().map(|u| u.to_lowercase()).collect();

    let users: Vec<WindowsUser> = all_users
        .into_iter()
        .map(|name| {
            let is_rdp = rdp_lower.contains(&name.to_lowercase());
            WindowsUser {
                name,
                is_rdp_user: is_rdp,
            }
        })
        .collect();

    Ok(users)
}

#[tauri::command]
pub fn add_windows_user(username: String, password: String) -> Result<(), String> {
    run_cmd(&["net", "user", &username, &password, "/add"])?;
    Ok(())
}

#[tauri::command]
pub fn delete_windows_user(username: String) -> Result<(), String> {
    run_cmd(&["net", "user", &username, "/delete"])?;
    Ok(())
}

#[tauri::command]
pub fn modify_windows_user_password(username: String, new_password: String) -> Result<(), String> {
    run_cmd(&["net", "user", &username, &new_password])?;
    Ok(())
}

#[tauri::command]
pub fn rename_windows_user(old_name: String, new_name: String) -> Result<(), String> {
    let script = format!(
        "Rename-LocalUser -Name '{}' -NewName '{}'",
        old_name, new_name
    );
    run_powershell(&script)?;
    Ok(())
}
