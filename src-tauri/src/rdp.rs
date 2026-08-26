use serde::{Deserialize, Serialize};
use std::net::{SocketAddr, TcpStream};
use std::process::Command;
use std::time::Duration;
use zeroize::Zeroize;

use crate::elevated::require_elevated;
use crate::ipc_error::{IpcError, IpcResult};
use crate::log_error;
use crate::user::{run_cmd, run_powershell};

const RDP_USERS_GROUP_SID: &str = "S-1-5-32-555";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RdpConnection {
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub username: String,
}

fn connections_file_path() -> Result<String, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "rdp.errors.appDataMissing".to_string())?;
    let dir = std::path::Path::new(&appdata).join("mxtools");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("rdp.errors.createDirFailed: {}", e))?;
    }
    Ok(dir
        .join("rdp_connections.json")
        .to_string_lossy()
        .to_string())
}

// ==================== RDP 状态与用户 ====================

#[tauri::command]
pub fn get_rdp_enabled() -> IpcResult<bool> {
    let script = r#"(Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' -Name 'fDenyTSConnections').fDenyTSConnections"#;
    let output = run_powershell(script).map_err(rdp_error)?;
    let val: i32 = output.trim().parse().unwrap_or(1);
    Ok(val == 0)
}

#[tauri::command]
pub fn set_rdp_enabled(enabled: bool) -> IpcResult<()> {
    require_elevated().map_err(rdp_error)?;
    let value = if enabled { "0" } else { "1" };
    let script = format!(
        "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server' -Name 'fDenyTSConnections' -Value {}",
        value
    );
    run_powershell(&script).map_err(rdp_error)?;

    if enabled {
        // Group 使用资源 ID，避免非英文系统上 "Remote Desktop" 显示名匹配失败
        let fw = run_powershell(
            "Get-NetFirewallRule -Group '@FirewallAPI.dll,-28752' -ErrorAction SilentlyContinue | Enable-NetFirewallRule",
        );
        if let Err(e) = fw {
            // 注册表已改；防火墙失败不整单失败，但要记日志（非英文系统曾用 group=remote desktop 易挂）
            log_error!("RDP firewall enable failed (locale-safe group): {}", e);
        }
    } else {
        let _ = run_powershell(
            "Get-NetFirewallRule -Group '@FirewallAPI.dll,-28752' -ErrorAction SilentlyContinue | Disable-NetFirewallRule",
        );
    }

    Ok(())
}

#[tauri::command]
pub fn get_rdp_users() -> IpcResult<Vec<String>> {
    let script = format!(
        "$members = @(Get-LocalGroupMember -SID '{}' -ErrorAction Stop | ForEach-Object {{ [string]$_.Name }}); [Console]::Out.Write(($members -join \"`n\"))",
        RDP_USERS_GROUP_SID
    );
    let output = run_powershell(&script).map_err(rdp_error)?;
    Ok(output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

fn escape_powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

fn set_rdp_group_membership(username: &str, add: bool) -> Result<(), String> {
    let command = if add {
        "Add-LocalGroupMember"
    } else {
        "Remove-LocalGroupMember"
    };
    let script = format!(
        "$memberSid = (Get-LocalUser -Name '{}' -ErrorAction Stop).SID; {} -SID '{}' -Member $memberSid -ErrorAction Stop",
        escape_powershell_single_quoted(username),
        command,
        RDP_USERS_GROUP_SID
    );
    run_powershell(&script).map(|_| ())
}

fn map_create_user_error(message: String) -> IpcError {
    let status = message
        .rsplit_once(':')
        .and_then(|(_, value)| value.trim().parse::<u32>().ok());
    match status {
        Some(2224) => IpcError::new("rdp.user_exists", message),
        Some(1325 | 2245) => IpcError::new("rdp.password_policy", message),
        _ => IpcError::new("rdp.create_user_failed", message),
    }
}

#[tauri::command]
pub fn add_rdp_user(username: String) -> IpcResult<()> {
    require_elevated().map_err(rdp_error)?;
    crate::user::validate_windows_username_pub(&username)
        .map_err(|message| IpcError::new("rdp.invalid_username", message))?;
    set_rdp_group_membership(&username, true).map_err(rdp_error)
}

#[tauri::command]
pub fn remove_rdp_user(username: String) -> IpcResult<()> {
    require_elevated().map_err(rdp_error)?;
    crate::user::validate_windows_username_pub(&username)
        .map_err(|message| IpcError::new("rdp.invalid_username", message))?;
    set_rdp_group_membership(&username, false).map_err(rdp_error)
}

#[tauri::command]
pub fn create_rdp_local_user(username: String, mut password: String) -> IpcResult<()> {
    let result = (|| {
        require_elevated().map_err(rdp_error)?;
        crate::user::validate_windows_username_pub(&username)
            .map_err(|message| IpcError::new("rdp.invalid_username", message))?;
        if password.is_empty() {
            return Err(IpcError::new(
                "rdp.password_required",
                "A password is required for a Remote Desktop account.",
            ));
        }
        crate::user::validate_windows_password_pub(&password)
            .map_err(|message| IpcError::new("rdp.invalid_password", message))?;

        #[cfg(windows)]
        {
            crate::user::net_user_add(&username, &password).map_err(map_create_user_error)?;
            if let Err(message) = set_rdp_group_membership(&username, true) {
                let rolled_back = run_cmd(&["net", "user", &username, "/delete"]).is_ok();
                let code = if rolled_back {
                    "rdp.grant_user_failed"
                } else {
                    "rdp.grant_user_rollback_failed"
                };
                return Err(IpcError::new(code, message).with_detail("rolledBack", rolled_back));
            }
            Ok(())
        }
        #[cfg(not(windows))]
        {
            Err(IpcError::new(
                "rdp.windows_only",
                "Remote Desktop account setup is only supported on Windows.",
            ))
        }
    })();
    password.zeroize();
    result
}

// ==================== RDP 端口 ====================

#[tauri::command]
pub fn get_rdp_port() -> IpcResult<u16> {
    let script = r#"(Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -Name 'PortNumber').PortNumber"#;
    let output = run_powershell(script).map_err(rdp_error)?;
    let port: u16 = output
        .trim()
        .parse()
        .map_err(|_| IpcError::new("rdp.parse_port_failed", "Unable to parse the RDP port."))?;
    Ok(port)
}

const RDP_CUSTOM_FIREWALL_RULE: &str = "mxtools Remote Desktop Custom Port";

#[tauri::command]
pub fn set_rdp_port(port: u16) -> IpcResult<()> {
    require_elevated().map_err(rdp_error)?;
    if port == 0 {
        return Err(IpcError::new(
            "rdp.invalid_port",
            "Port must be between 1 and 65535.",
        ));
    }

    let script = format!(
        "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp' -Name 'PortNumber' -Value {}",
        port
    );
    run_powershell(&script).map_err(rdp_error)?;

    // 自定义端口需单独放行；先删旧规则再添加，避免残留。
    let _ = run_cmd(&[
        "netsh",
        "advfirewall",
        "firewall",
        "delete",
        "rule",
        &format!("name={}", RDP_CUSTOM_FIREWALL_RULE),
    ]);
    if port != 3389 {
        run_cmd(&[
            "netsh",
            "advfirewall",
            "firewall",
            "add",
            "rule",
            &format!("name={}", RDP_CUSTOM_FIREWALL_RULE),
            "dir=in",
            "action=allow",
            "protocol=TCP",
            &format!("localport={}", port),
            "profile=any",
        ])
        .map_err(rdp_error)?;
    }

    // 注册表改端口后需重启 TermService 才会真正监听新端口。
    run_powershell("Restart-Service -Name TermService -Force").map_err(rdp_error)?;
    Ok(())
}

// ==================== 远程端口检测 ====================

#[tauri::command]
pub fn check_remote_port(ip: String, port: u16) -> IpcResult<bool> {
    let addr: SocketAddr = format!("{}:{}", ip, port)
        .parse::<SocketAddr>()
        .map_err(|error| {
            IpcError::new("rdp.invalid_address", error.to_string())
                .with_detail("ip", ip)
                .with_detail("port", port)
        })?;

    match TcpStream::connect_timeout(&addr, Duration::from_secs(3)) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

fn sanitize_rdp_field(value: &str, field: &str) -> Result<String, String> {
    let value = value.trim();
    if value.chars().any(|c| matches!(c, '\r' | '\n' | '\0')) {
        return Err(format!("rdp.errors.invalidField: {}", field));
    }
    Ok(value.to_string())
}

// ==================== 一键连接 ====================

#[tauri::command]
pub fn connect_rdp(ip: String, port: u16, username: Option<String>) -> IpcResult<()> {
    let ip = sanitize_rdp_field(&ip, "ip").map_err(|message| {
        IpcError::new("rdp.invalid_field", message).with_detail("field", "ip")
    })?;
    let username =
        sanitize_rdp_field(username.as_deref().unwrap_or(""), "username").map_err(|message| {
            IpcError::new("rdp.invalid_field", message).with_detail("field", "username")
        })?;
    if username.is_empty() {
        let addr = if port == 3389 {
            ip
        } else {
            format!("{}:{}", ip, port)
        };
        Command::new("mstsc")
            .args(["/v", &addr])
            .spawn()
            .map_err(|error| IpcError::new("rdp.start_mstsc_failed", error.to_string()))?;
        return Ok(());
    }

    let content = format!(
        "screen mode id:i:2\r\nuse multimon:i:0\r\ndesktopwidth:i:1920\r\ndesktopheight:i:1080\r\nsession bpp:i:32\r\nfull address:s:{}:{}\r\nusername:s:{}\r\naudiomode:i:0\r\n",
        ip, port, username
    );
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!(
        "mxtools_rdp_{}.rdp",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    std::fs::write(&temp_path, content)
        .map_err(|error| IpcError::new("rdp.write_temp_rdp_failed", error.to_string()))?;
    let spawn_result = Command::new("mstsc")
        .arg(&temp_path)
        .spawn()
        .map_err(|e| format!("rdp.errors.startMstscFailed: {}", e));
    // mstsc 会尽快读完 .rdp；短暂延迟后删除，避免残留含用户名的临时文件
    let cleanup_path = temp_path.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        let _ = std::fs::remove_file(&cleanup_path);
    });
    spawn_result.map_err(|message| IpcError::new("rdp.start_mstsc_failed", message))?;
    Ok(())
}

// ==================== 连接配置持久化 ====================

#[tauri::command]
pub fn save_rdp_connections(connections: Vec<RdpConnection>) -> IpcResult<()> {
    let path = connections_file_path().map_err(rdp_error)?;
    let json = serde_json::to_string_pretty(&connections)
        .map_err(|error| IpcError::new("rdp.serialize_failed", error.to_string()))?;
    std::fs::write(&path, json)
        .map_err(|error| IpcError::new("rdp.write_file_failed", error.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn load_rdp_connections() -> IpcResult<Vec<RdpConnection>> {
    let path = connections_file_path().map_err(rdp_error)?;
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(p)
        .map_err(|error| IpcError::new("rdp.read_file_failed", error.to_string()))?;
    let connections: Vec<RdpConnection> = serde_json::from_str(&content)
        .map_err(|error| IpcError::new("rdp.parse_json_failed", error.to_string()))?;
    Ok(connections)
}

#[tauri::command]
pub fn export_rdp_file(connection: RdpConnection, path: String) -> IpcResult<()> {
    let ip = sanitize_rdp_field(&connection.ip, "ip").map_err(|message| {
        IpcError::new("rdp.invalid_field", message).with_detail("field", "ip")
    })?;
    let username = sanitize_rdp_field(&connection.username, "username").map_err(|message| {
        IpcError::new("rdp.invalid_field", message).with_detail("field", "username")
    })?;
    let content = format!(
        "screen mode id:i:2\r\nuse multimon:i:0\r\ndesktopwidth:i:1920\r\ndesktopheight:i:1080\r\nsession bpp:i:32\r\nfull address:s:{}:{}\r\nusername:s:{}\r\naudiomode:i:0\r\n",
        ip, connection.port, username
    );
    std::fs::write(&path, content)
        .map_err(|error| IpcError::new("rdp.export_rdp_failed", error.to_string()))?;
    Ok(())
}

fn rdp_error(message: String) -> IpcError {
    IpcError::operation_failed("rdp", message)
}
