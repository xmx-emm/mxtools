use crate::elevated::require_elevated;
use crate::ipc_error::{IpcError, IpcResult};
use serde::{Deserialize, Serialize};
pub use windows_tool::utils::{run_cmd, run_powershell};

fn user_error(error: String) -> IpcError {
    IpcError::operation_failed("user", error)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowsUser {
    pub name: String,
    pub is_rdp_user: bool,
}

/// `net user` / `net localgroup` 在英文与中文系统下的成功结束语。
fn is_net_command_completed(line: &str) -> bool {
    let t = line.trim();
    t.starts_with("The command completed")
        || t.starts_with("命令成功完成")
        || t.starts_with("命令已成功完成")
}

/// PowerShell 单引号字符串转义：`'` → `''`。
fn escape_powershell_single_quoted(s: &str) -> String {
    s.replace('\'', "''")
}

pub fn parse_user_list_from_net_user(output: &str) -> Vec<String> {
    let mut users = Vec::new();
    let mut in_user_section = false;

    for line in output.lines() {
        if line.starts_with("---") {
            in_user_section = true;
            continue;
        }
        if !in_user_section {
            continue;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if is_net_command_completed(trimmed) {
            break;
        }
        for name in trimmed.split_whitespace() {
            if !name.is_empty() {
                users.push(name.to_string());
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
        if !in_member_section {
            continue;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if is_net_command_completed(trimmed) {
            break;
        }
        members.push(trimmed.to_string());
    }
    members
}

#[tauri::command]
pub fn get_windows_users() -> IpcResult<Vec<WindowsUser>> {
    let user_output = run_cmd(&["net", "user"]).map_err(user_error)?;
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
pub fn add_windows_user(username: String, password: String) -> IpcResult<()> {
    require_elevated().map_err(user_error)?;
    validate_windows_username(&username).map_err(user_error)?;
    validate_windows_password(&password).map_err(user_error)?;
    #[cfg(windows)]
    {
        net_user_add(&username, &password).map_err(user_error)
    }
    #[cfg(not(windows))]
    {
        let _ = password;
        Err(IpcError::new("user.windows_only", "Windows only"))
    }
}

#[tauri::command]
pub fn delete_windows_user(username: String) -> IpcResult<()> {
    require_elevated().map_err(user_error)?;
    validate_windows_username(&username).map_err(user_error)?;
    run_cmd(&["net", "user", &username, "/delete"]).map_err(user_error)?;
    Ok(())
}

#[tauri::command]
pub fn modify_windows_user_password(username: String, new_password: String) -> IpcResult<()> {
    require_elevated().map_err(user_error)?;
    validate_windows_username(&username).map_err(user_error)?;
    validate_windows_password(&new_password).map_err(user_error)?;
    #[cfg(windows)]
    {
        net_user_set_password(&username, &new_password).map_err(user_error)
    }
    #[cfg(not(windows))]
    {
        let _ = new_password;
        Err(IpcError::new("user.windows_only", "Windows only"))
    }
}

#[tauri::command]
pub fn rename_windows_user(old_name: String, new_name: String) -> IpcResult<()> {
    require_elevated().map_err(user_error)?;
    validate_windows_username(&old_name).map_err(user_error)?;
    validate_windows_username(&new_name).map_err(user_error)?;
    let script = format!(
        "Rename-LocalUser -Name '{}' -NewName '{}'",
        escape_powershell_single_quoted(&old_name),
        escape_powershell_single_quoted(&new_name)
    );
    run_powershell(&script).map_err(user_error)?;
    Ok(())
}

/// 本地帐户名：非空、≤20、不含 SAM 非法字符。
pub fn validate_windows_username_pub(name: &str) -> Result<(), String> {
    validate_windows_username(name)
}

fn validate_windows_username(name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 20 {
        return Err("user.errors.invalidUsername".into());
    }
    if name.chars().any(|c| {
        matches!(
            c,
            '"' | '/'
                | '\\'
                | '['
                | ']'
                | ':'
                | ';'
                | '|'
                | '='
                | ','
                | '+'
                | '*'
                | '?'
                | '<'
                | '>'
                | '@'
                | ' '
        )
    }) {
        return Err("user.errors.invalidUsername".into());
    }
    Ok(())
}

fn validate_windows_password(password: &str) -> Result<(), String> {
    if password.len() > 127 {
        return Err("user.errors.passwordTooLong".into());
    }
    if password.contains('\0') {
        return Err("user.errors.invalidPassword".into());
    }
    Ok(())
}

#[cfg(windows)]
fn to_wide_null(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(windows)]
fn zero_wide(buf: &mut [u16]) {
    for b in buf.iter_mut() {
        unsafe { std::ptr::write_volatile(b, 0) };
    }
}

#[cfg(windows)]
fn net_user_add(username: &str, password: &str) -> Result<(), String> {
    use std::mem::zeroed;
    use std::ptr;
    use winapi::shared::winerror::ERROR_SUCCESS;
    use winapi::um::lmaccess::{
        NetUserAdd, UF_NORMAL_ACCOUNT, UF_SCRIPT, USER_INFO_1, USER_PRIV_USER,
    };

    let mut name = to_wide_null(username);
    let mut pass = to_wide_null(password);
    let mut info: USER_INFO_1 = unsafe { zeroed() };
    info.usri1_name = name.as_mut_ptr();
    info.usri1_password = pass.as_mut_ptr();
    info.usri1_priv = USER_PRIV_USER;
    info.usri1_flags = UF_SCRIPT | UF_NORMAL_ACCOUNT;

    let mut parm_err: u32 = 0;
    let status = unsafe {
        NetUserAdd(
            ptr::null(),
            1,
            &mut info as *mut _ as *mut u8,
            &mut parm_err,
        )
    };
    zero_wide(&mut pass);
    if status != ERROR_SUCCESS {
        return Err(format!("user.errors.netUserAdd: {}", status));
    }
    Ok(())
}

#[cfg(windows)]
fn net_user_set_password(username: &str, password: &str) -> Result<(), String> {
    use std::mem::zeroed;
    use std::ptr;
    use winapi::shared::winerror::ERROR_SUCCESS;
    use winapi::um::lmaccess::{NetUserSetInfo, USER_INFO_1003};

    let mut name = to_wide_null(username);
    let mut pass = to_wide_null(password);
    let mut info: USER_INFO_1003 = unsafe { zeroed() };
    info.usri1003_password = pass.as_mut_ptr();

    let mut parm_err: u32 = 0;
    let status = unsafe {
        NetUserSetInfo(
            ptr::null(),
            name.as_mut_ptr(),
            1003,
            &mut info as *mut _ as *mut u8,
            &mut parm_err,
        )
    };
    zero_wide(&mut pass);
    if status != ERROR_SUCCESS {
        return Err(format!("user.errors.netUserSetPassword: {}", status));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_chinese_net_user() {
        let output = "\
\\\\DESKTOP-PC 的用户帐户

-------------------------------------------------------------------------------
Administrator            DefaultAccount           emm
Guest                    WDAGUtilityAccount
命令成功完成。
";
        let users = parse_user_list_from_net_user(output);
        assert_eq!(
            users,
            vec![
                "Administrator",
                "DefaultAccount",
                "emm",
                "Guest",
                "WDAGUtilityAccount"
            ]
        );
        assert!(!users.iter().any(|u| u.contains("命令")));
    }

    #[test]
    fn parse_english_net_user() {
        let output = "\
User accounts for \\\\DESKTOP-PC

-------------------------------------------------------------------------------
Administrator            Guest                    TestUser
The command completed successfully.
";
        let users = parse_user_list_from_net_user(output);
        assert_eq!(users, vec!["Administrator", "Guest", "TestUser"]);
    }

    #[test]
    fn parse_chinese_group_members() {
        let output = "\
别名     Remote Desktop Users
注释     成员可以远程登录

成员

-------------------------------------------------------------------------------
emm
命令成功完成。
";
        let members = parse_group_members(output);
        assert_eq!(members, vec!["emm"]);
    }

    #[test]
    fn escape_ps_single_quote() {
        assert_eq!(escape_powershell_single_quoted("O'Brien"), "O''Brien");
    }
}
