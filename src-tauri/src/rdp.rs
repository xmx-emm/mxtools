use serde::{Deserialize, Serialize};
use std::net::{SocketAddr, TcpStream};
use std::process::Command;
use std::time::Duration;

use crate::user::{parse_group_members, run_cmd, run_powershell};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RdpConnection {
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub username: String,
}

fn connections_file_path() -> Result<String, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取APPDATA路径".to_string())?;
    let dir = std::path::Path::new(&appdata).join("mxtools");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    Ok(dir
        .join("rdp_connections.json")
        .to_string_lossy()
        .to_string())
}

// ==================== RDP 状态与用户 ====================

#[tauri::command]
pub fn get_rdp_enabled() -> Result<bool, String> {
    let script = r#"(Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' -Name 'fDenyTSConnections').fDenyTSConnections"#;
    let output = run_powershell(script)?;
    let val: i32 = output.trim().parse().unwrap_or(1);
    Ok(val == 0)
}

#[tauri::command]
pub fn set_rdp_enabled(enabled: bool) -> Result<(), String> {
    let value = if enabled { "0" } else { "1" };
    let script = format!(
        "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server' -Name 'fDenyTSConnections' -Value {}",
        value
    );
    run_powershell(&script)?;

    if enabled {
        run_cmd(&[
            "netsh",
            "advfirewall",
            "firewall",
            "set",
            "rule",
            "group=remote desktop",
            "new",
            "enable=yes",
        ])?;
    } else {
        run_cmd(&[
            "netsh",
            "advfirewall",
            "firewall",
            "set",
            "rule",
            "group=remote desktop",
            "new",
            "enable=no",
        ])
        .ok();
    }

    Ok(())
}

#[tauri::command]
pub fn get_rdp_users() -> Result<Vec<String>, String> {
    let output = run_cmd(&["net", "localgroup", "Remote Desktop Users"])?;
    Ok(parse_group_members(&output))
}

#[tauri::command]
pub fn add_rdp_user(username: String) -> Result<(), String> {
    run_cmd(&[
        "net",
        "localgroup",
        "Remote Desktop Users",
        &username,
        "/add",
    ])?;
    Ok(())
}

#[tauri::command]
pub fn remove_rdp_user(username: String) -> Result<(), String> {
    run_cmd(&[
        "net",
        "localgroup",
        "Remote Desktop Users",
        &username,
        "/delete",
    ])?;
    Ok(())
}

// ==================== RDP 端口 ====================

#[tauri::command]
pub fn get_rdp_port() -> Result<u16, String> {
    let script = r#"(Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -Name 'PortNumber').PortNumber"#;
    let output = run_powershell(script)?;
    let port: u16 = output
        .trim()
        .parse()
        .map_err(|_| "无法解析RDP端口号".to_string())?;
    Ok(port)
}

#[tauri::command]
pub fn set_rdp_port(port: u16) -> Result<(), String> {
    let script = format!(
        "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp' -Name 'PortNumber' -Value {}",
        port
    );
    run_powershell(&script)?;
    Ok(())
}

// ==================== 远程端口检测 ====================

#[tauri::command]
pub fn check_remote_port(ip: String, port: u16) -> Result<bool, String> {
    let addr: SocketAddr = format!("{}:{}", ip, port)
        .parse()
        .map_err(|e| format!("地址格式错误: {}", e))?;

    match TcpStream::connect_timeout(&addr, Duration::from_secs(3)) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

// ==================== 一键连接 ====================

#[tauri::command]
pub fn connect_rdp(ip: String, port: u16) -> Result<(), String> {
    let addr = if port == 3389 {
        ip
    } else {
        format!("{}:{}", ip, port)
    };
    Command::new("mstsc")
        .args(["/v", &addr])
        .spawn()
        .map_err(|e| format!("启动远程桌面失败: {}", e))?;
    Ok(())
}

// ==================== 连接配置持久化 ====================

#[tauri::command]
pub fn save_rdp_connections(connections: Vec<RdpConnection>) -> Result<(), String> {
    let path = connections_file_path()?;
    let json =
        serde_json::to_string_pretty(&connections).map_err(|e| format!("序列化失败: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("写入文件失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn load_rdp_connections() -> Result<Vec<RdpConnection>, String> {
    let path = connections_file_path()?;
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(p).map_err(|e| format!("读取文件失败: {}", e))?;
    let connections: Vec<RdpConnection> =
        serde_json::from_str(&content).map_err(|e| format!("解析JSON失败: {}", e))?;
    Ok(connections)
}

#[tauri::command]
pub fn export_rdp_file(connection: RdpConnection, path: String) -> Result<(), String> {
    let content = format!(
        "screen mode id:i:2\r\nuse multimon:i:0\r\ndesktopwidth:i:1920\r\ndesktopheight:i:1080\r\nsession bpp:i:32\r\nfull address:s:{}:{}\r\nusername:s:{}\r\naudiomode:i:0\r\n",
        connection.ip, connection.port, connection.username
    );
    std::fs::write(&path, content).map_err(|e| format!("导出RDP文件失败: {}", e))?;
    Ok(())
}
