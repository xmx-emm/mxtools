use crate::elevated::require_elevated;
use crate::ipc_error::{IpcError, IpcResult};
use serde::{Deserialize, Serialize};
pub use windows_tool::utils::{run_cmd, run_powershell};

fn user_error(error: String) -> IpcError {
    IpcError::operation_failed("user", error)
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum WindowsAccountKind {
    Local,
    Microsoft,
    ActiveDirectory,
    Entra,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowsUser {
    pub name: String,
    pub full_name: Option<String>,
    pub sid: String,
    pub account_name: String,
    pub account_kind: WindowsAccountKind,
    pub rdp_username: Option<String>,
    pub enabled: bool,
    pub password_required: bool,
    pub is_current: bool,
    pub is_rdp_user: bool,
    pub is_administrator: bool,
    pub is_system: bool,
    pub can_manage_locally: bool,
}

#[derive(Debug, Deserialize)]
struct RawWindowsUser {
    name: String,
    full_name: String,
    sid: String,
    account_name: String,
    account_source: String,
    enabled: bool,
    password_required: bool,
    is_current: bool,
    is_rdp_user: bool,
    is_administrator: bool,
    is_system: bool,
}

const WINDOWS_USER_QUERY_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$currentSid = [string][System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$rdpSids = @{}
$adminSids = @{}
try {
  foreach ($member in @(Get-LocalGroupMember -SID 'S-1-5-32-555' -ErrorAction Stop)) {
    if ($null -ne $member.SID) { $rdpSids[[string]$member.SID.Value] = $true }
  }
} catch {}
try {
  foreach ($member in @(Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop)) {
    if ($null -ne $member.SID) { $adminSids[[string]$member.SID.Value] = $true }
  }
} catch {}
$users = foreach ($user in @(Get-LocalUser -ErrorAction Stop)) {
  $sid = [string]$user.SID.Value
  try {
    $accountName = (New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount]).Value
  } catch {
    $accountName = $env:COMPUTERNAME + '\' + [string]$user.Name
  }
  [pscustomobject]@{
    name = [string]$user.Name
    full_name = [string]$user.FullName
    sid = $sid
    account_name = [string]$accountName
    account_source = if ($null -eq $user.PrincipalSource) { '' } else { [string]$user.PrincipalSource }
    enabled = [bool]$user.Enabled
    password_required = [bool]$user.PasswordRequired
    is_current = $sid -eq $currentSid
    is_rdp_user = $rdpSids.ContainsKey($sid)
    is_administrator = $adminSids.ContainsKey($sid)
    is_system = $sid -match '-(500|501|503|504)$'
  }
}
[Console]::Out.Write((ConvertTo-Json -InputObject @($users) -Depth 3 -Compress))
"#;

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
    if let Ok(output) = run_powershell(WINDOWS_USER_QUERY_SCRIPT) {
        if let Ok(users) = serde_json::from_str::<Vec<RawWindowsUser>>(output.trim()) {
            return Ok(users.into_iter().map(map_windows_user).collect());
        }
    }

    get_windows_users_fallback()
}

fn map_windows_user(user: RawWindowsUser) -> WindowsUser {
    let account_kind = match user.account_source.to_ascii_lowercase().as_str() {
        "local" => WindowsAccountKind::Local,
        "microsoftaccount" | "microsoft account" => WindowsAccountKind::Microsoft,
        "activedirectory" | "active directory" => WindowsAccountKind::ActiveDirectory,
        "azuread" | "microsoftentra" | "microsoft entra group" => WindowsAccountKind::Entra,
        _ => WindowsAccountKind::Unknown,
    };
    let can_manage_locally = matches!(account_kind, WindowsAccountKind::Local) && !user.is_system;
    let rdp_username =
        (!matches!(account_kind, WindowsAccountKind::Microsoft)).then(|| user.account_name.clone());

    WindowsUser {
        name: user.name,
        full_name: non_empty(user.full_name),
        sid: user.sid,
        account_name: user.account_name,
        account_kind,
        rdp_username,
        enabled: user.enabled,
        password_required: user.password_required,
        is_current: user.is_current,
        is_rdp_user: user.is_rdp_user,
        is_administrator: user.is_administrator,
        is_system: user.is_system,
        can_manage_locally,
    }
}

fn non_empty(value: String) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn get_windows_users_fallback() -> IpcResult<Vec<WindowsUser>> {
    let user_output = run_cmd(&["net", "user"]).map_err(user_error)?;
    let all_users = parse_user_list_from_net_user(&user_output);

    let rdp_output = run_cmd(&["net", "localgroup", "Remote Desktop Users"]);
    let rdp_users = match rdp_output {
        Ok(out) => parse_group_members(&out),
        Err(_) => Vec::new(),
    };

    let computer_name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| ".".into());
    let current_name = std::env::var("USERNAME").unwrap_or_default();

    let users: Vec<WindowsUser> = all_users
        .into_iter()
        .map(|name| {
            let account_name = format!(r"{}\{}", computer_name, name);
            let is_system = matches!(
                name.to_ascii_lowercase().as_str(),
                "administrator" | "guest" | "defaultaccount" | "wdagutilityaccount"
            );
            WindowsUser {
                full_name: None,
                sid: String::new(),
                account_name: account_name.clone(),
                account_kind: WindowsAccountKind::Local,
                rdp_username: Some(account_name),
                enabled: true,
                password_required: true,
                is_current: name.eq_ignore_ascii_case(&current_name),
                is_rdp_user: rdp_users.iter().any(|member| {
                    member.eq_ignore_ascii_case(&name)
                        || member
                            .rsplit_once('\\')
                            .is_some_and(|(_, member_name)| member_name.eq_ignore_ascii_case(&name))
                }),
                is_administrator: false,
                is_system,
                can_manage_locally: !is_system,
                name,
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

pub fn validate_windows_password_pub(password: &str) -> Result<(), String> {
    validate_windows_password(password)
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
pub(crate) fn net_user_add(username: &str, password: &str) -> Result<(), String> {
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
Administrator            DefaultAccount           TestUser
Guest                    WDAGUtilityAccount
命令成功完成。
";
        let users = parse_user_list_from_net_user(output);
        assert_eq!(
            users,
            vec![
                "Administrator",
                "DefaultAccount",
                "TestUser",
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
TestUser
命令成功完成。
";
        let members = parse_group_members(output);
        assert_eq!(members, vec!["TestUser"]);
    }

    #[test]
    fn escape_ps_single_quote() {
        assert_eq!(escape_powershell_single_quoted("O'Brien"), "O''Brien");
    }
}
