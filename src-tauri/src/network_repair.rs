//! Independent Windows network diagnosis and repair.
//!
//! This module deliberately does not participate in the existing download or
//! game-network request paths. It gives users an explicit workflow for stale
//! proxy environment variables and Windows proxy settings.

use crate::ipc_error::{IpcError, IpcResult};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashSet;

const PROXY_ENV_NAMES: &[&str] = &[
    "ALL_PROXY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "all_proxy",
    "http_proxy",
    "https_proxy",
];
// NO_PROXY is a bypass allowlist, not a proxy source. It is intentionally
// preserved by every repair action so local services are not accidentally
// routed through a remote proxy after repair.

const ACTIONS: &[&str] = &[
    "clear_process_proxy",
    "clear_user_proxy",
    "clear_machine_proxy",
    "disable_wininet_proxy",
    "reset_winhttp_proxy",
    "flush_dns_cache",
    "reset_winsock",
    "reset_tcpip",
];

const CHECK_IDS: &[&str] = &[
    "proxy_environment",
    "wininet_proxy",
    "proxy_policy",
    "winhttp_proxy",
    "network_adapters",
    "dns_resolution",
    "internet_connectivity",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum CheckStatus {
    Pass,
    Warning,
    Error,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkRepairCheck {
    id: String,
    status: CheckStatus,
    detail_code: String,
    params: Map<String, Value>,
    repair_actions: Vec<String>,
    requires_admin: bool,
}

impl NetworkRepairCheck {
    fn new(id: &str, status: CheckStatus, detail_code: &str) -> Self {
        Self {
            id: id.to_string(),
            status,
            detail_code: detail_code.to_string(),
            params: Map::new(),
            repair_actions: Vec::new(),
            requires_admin: false,
        }
    }

    fn with_param(mut self, key: &str, value: impl Into<Value>) -> Self {
        self.params.insert(key.to_string(), value.into());
        self
    }

    fn with_actions(mut self, actions: &[&str], requires_admin: bool) -> Self {
        self.repair_actions = actions.iter().map(|action| (*action).to_string()).collect();
        self.requires_admin = requires_admin;
        self
    }
}

#[derive(Debug, Deserialize)]
pub struct NetworkRepairRequest {
    pub actions: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkRepairActionResult {
    action: String,
    success: bool,
    error_code: Option<String>,
    restart_required: bool,
}

impl NetworkRepairActionResult {
    fn success(action: &str, restart_required: bool) -> Self {
        Self {
            action: action.to_string(),
            success: true,
            error_code: None,
            restart_required,
        }
    }

    fn failure(action: &str, error_code: &str) -> Self {
        Self {
            action: action.to_string(),
            success: false,
            error_code: Some(error_code.to_string()),
            restart_required: false,
        }
    }
}

fn network_repair_error(reason: &str, message: impl Into<String>) -> IpcError {
    IpcError::new(format!("network_repair.{reason}"), message)
}

fn normalized_actions(actions: Vec<String>) -> IpcResult<Vec<String>> {
    if actions.is_empty() || actions.len() > ACTIONS.len() * 2 {
        return Err(network_repair_error(
            "invalid_action",
            "Network repair action selection is invalid",
        ));
    }
    let requested = actions.into_iter().collect::<HashSet<_>>();
    if requested
        .iter()
        .any(|action| !ACTIONS.contains(&action.as_str()))
    {
        return Err(network_repair_error(
            "invalid_action",
            "Network repair action is not supported",
        ));
    }
    Ok(ACTIONS
        .iter()
        .filter(|action| requested.contains(**action))
        .map(|action| (*action).to_string())
        .collect())
}

fn normalized_check_id(check_id: String) -> IpcResult<String> {
    if CHECK_IDS.contains(&check_id.as_str()) {
        Ok(check_id)
    } else {
        Err(network_repair_error(
            "invalid_check",
            "Network repair diagnostic check is not supported",
        ))
    }
}

#[tauri::command]
pub async fn diagnose_network_repair_check(check_id: String) -> IpcResult<NetworkRepairCheck> {
    let check_id = normalized_check_id(check_id)?;
    tokio::task::spawn_blocking(move || diagnose_check_inner(&check_id))
        .await
        .map_err(|error| network_repair_error("operation_failed", error.to_string()))?
}

#[tauri::command]
pub async fn repair_network(
    request: NetworkRepairRequest,
) -> IpcResult<Vec<NetworkRepairActionResult>> {
    let actions = normalized_actions(request.actions)?;
    tokio::task::spawn_blocking(move || repair_inner(actions))
        .await
        .map_err(|error| network_repair_error("operation_failed", error.to_string()))?
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::net::{TcpStream, ToSocketAddrs};
    use std::process::{Command, Output};
    use std::time::Duration;
    use windows_tool::utils::decode_process_output;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    const USER_ENV_PATH: &str = r"Environment";
    const MACHINE_ENV_PATH: &str = r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment";
    const WININET_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";
    const WININET_POLICY_PATH: &str =
        r"Software\Policies\Microsoft\Windows\CurrentVersion\Internet Settings";

    fn command_output(program: &str, args: &[&str]) -> Result<Output, String> {
        Command::new(program)
            .args(args)
            .output()
            .map_err(|error| error.to_string())
    }

    fn powershell(script: &str) -> Result<String, String> {
        let output = command_output(
            "powershell.exe",
            &[
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ],
        )?;
        let stdout = decode_process_output(&output.stdout).trim().to_string();
        if output.status.success() {
            Ok(stdout)
        } else {
            let stderr = decode_process_output(&output.stderr).trim().to_string();
            Err(if stderr.is_empty() { stdout } else { stderr })
        }
    }

    fn registry_proxy_names(root: winreg::HKEY, path: &str) -> Vec<String> {
        let Ok(key) = RegKey::predef(root).open_subkey_with_flags(path, KEY_READ) else {
            return Vec::new();
        };
        key.enum_values()
            .filter_map(Result::ok)
            .map(|(name, _)| name)
            .filter(|name| {
                PROXY_ENV_NAMES
                    .iter()
                    .any(|candidate| candidate.eq_ignore_ascii_case(name))
            })
            .collect()
    }

    fn check_proxy_environment() -> NetworkRepairCheck {
        let process_names = PROXY_ENV_NAMES
            .iter()
            .filter(|name| std::env::var_os(name).is_some())
            .map(|name| (*name).to_string())
            .collect::<Vec<_>>();
        let user_names = registry_proxy_names(HKEY_CURRENT_USER, USER_ENV_PATH);
        let machine_names = registry_proxy_names(HKEY_LOCAL_MACHINE, MACHINE_ENV_PATH);
        let process = process_names.len();
        let user = user_names.len();
        let machine = machine_names.len();
        if process + user + machine == 0 {
            NetworkRepairCheck::new("proxy_environment", CheckStatus::Pass, "none")
        } else {
            NetworkRepairCheck::new("proxy_environment", CheckStatus::Warning, "configured")
                .with_param("processCount", process as u64)
                .with_param("userCount", user as u64)
                .with_param("machineCount", machine as u64)
                .with_param("processVariables", process_names.join(", "))
                .with_param("userVariables", user_names.join(", "))
                .with_param("machineVariables", machine_names.join(", "))
                .with_actions(
                    &[
                        "clear_process_proxy",
                        "clear_user_proxy",
                        "clear_machine_proxy",
                    ],
                    machine > 0,
                )
        }
    }

    fn check_wininet_proxy() -> NetworkRepairCheck {
        let Ok(key) =
            RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(WININET_PATH, KEY_READ)
        else {
            return NetworkRepairCheck::new("wininet_proxy", CheckStatus::Error, "unavailable");
        };
        let enabled = key.get_value::<u32, _>("ProxyEnable").unwrap_or(0) != 0;
        let auto_config = key
            .get_value::<String, _>("AutoConfigURL")
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false);
        if !enabled && !auto_config {
            NetworkRepairCheck::new("wininet_proxy", CheckStatus::Pass, "direct")
        } else {
            NetworkRepairCheck::new("wininet_proxy", CheckStatus::Warning, "configured")
                .with_param("proxyEnabled", enabled)
                .with_param("autoConfigEnabled", auto_config)
                .with_actions(&["disable_wininet_proxy"], false)
        }
    }

    fn check_proxy_policy() -> NetworkRepairCheck {
        let policy_names = ["ProxySettingsPerUser", "ProxyEnable", "AutoConfigURL"];
        let mut scopes = Vec::new();
        for (scope, root) in [("user", HKEY_CURRENT_USER), ("machine", HKEY_LOCAL_MACHINE)] {
            let Ok(key) =
                RegKey::predef(root).open_subkey_with_flags(WININET_POLICY_PATH, KEY_READ)
            else {
                continue;
            };
            if key.enum_values().filter_map(Result::ok).any(|(name, _)| {
                policy_names
                    .iter()
                    .any(|candidate| candidate.eq_ignore_ascii_case(&name))
            }) {
                scopes.push(scope);
            }
        }
        if scopes.is_empty() {
            NetworkRepairCheck::new("proxy_policy", CheckStatus::Pass, "none")
        } else {
            NetworkRepairCheck::new("proxy_policy", CheckStatus::Warning, "managed")
                .with_param("scopes", scopes.join(", "))
        }
    }

    fn check_winhttp_proxy() -> NetworkRepairCheck {
        match command_output("netsh.exe", &["winhttp", "show", "proxy"]) {
            Ok(output) if output.status.success() => {
                let text = format!(
                    "{}\n{}",
                    decode_process_output(&output.stdout),
                    decode_process_output(&output.stderr)
                )
                .to_ascii_lowercase();
                let direct = text.contains("direct access")
                    || text.contains("directe zugriff")
                    || text.contains("\u{76f4}\u{63a5}\u{8bbf}\u{95ee}")
                    || text.contains("\u{65e0}\u{4ee3}\u{7406}")
                    || text.contains("kein proxy")
                    || text.contains("<none>");
                if direct {
                    NetworkRepairCheck::new("winhttp_proxy", CheckStatus::Pass, "direct")
                } else {
                    NetworkRepairCheck::new("winhttp_proxy", CheckStatus::Warning, "configured")
                        .with_actions(&["reset_winhttp_proxy"], true)
                }
            }
            Ok(_) | Err(_) => {
                NetworkRepairCheck::new("winhttp_proxy", CheckStatus::Error, "unavailable")
            }
        }
    }

    fn check_adapters() -> NetworkRepairCheck {
        let script = "@(Get-NetAdapter -Physical -ErrorAction Stop | Select-Object Name,Status) | ConvertTo-Json -Compress";
        let Ok(raw) = powershell(script) else {
            return NetworkRepairCheck::new("network_adapters", CheckStatus::Error, "unavailable");
        };
        let value = serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null);
        let items = match value {
            Value::Array(items) => items,
            Value::Object(item) => vec![Value::Object(item)],
            _ => Vec::new(),
        };
        let total = items.len();
        let up = items
            .iter()
            .filter(|item| item.get("Status").and_then(Value::as_str) == Some("Up"))
            .count();
        if up > 0 {
            NetworkRepairCheck::new("network_adapters", CheckStatus::Pass, "connected")
                .with_param("total", total as u64)
                .with_param("up", up as u64)
        } else {
            NetworkRepairCheck::new(
                "network_adapters",
                CheckStatus::Warning,
                "noConnectedAdapter",
            )
            .with_param("total", total as u64)
            .with_param("up", 0u64)
        }
    }

    fn check_connectivity() -> NetworkRepairCheck {
        let candidates = ["1.1.1.1:443", "8.8.8.8:443"];
        let reachable = candidates
            .iter()
            .filter_map(|target| target.to_socket_addrs().ok())
            .flatten()
            .any(|address| TcpStream::connect_timeout(&address, Duration::from_secs(2)).is_ok());
        if reachable {
            NetworkRepairCheck::new("internet_connectivity", CheckStatus::Pass, "reachable")
        } else {
            NetworkRepairCheck::new("internet_connectivity", CheckStatus::Warning, "unreachable")
                .with_actions(&["flush_dns_cache", "reset_winsock", "reset_tcpip"], true)
        }
    }

    fn check_dns_resolution() -> NetworkRepairCheck {
        let resolved = "example.com:443"
            .to_socket_addrs()
            .map(|mut addresses| addresses.next().is_some())
            .unwrap_or(false);
        if resolved {
            NetworkRepairCheck::new("dns_resolution", CheckStatus::Pass, "resolved")
        } else {
            NetworkRepairCheck::new("dns_resolution", CheckStatus::Warning, "failed")
                .with_actions(&["flush_dns_cache"], false)
        }
    }

    pub(super) fn diagnose(check_id: &str) -> NetworkRepairCheck {
        match check_id {
            "proxy_environment" => check_proxy_environment(),
            "wininet_proxy" => check_wininet_proxy(),
            "proxy_policy" => check_proxy_policy(),
            "winhttp_proxy" => check_winhttp_proxy(),
            "network_adapters" => check_adapters(),
            "dns_resolution" => check_dns_resolution(),
            "internet_connectivity" => check_connectivity(),
            _ => unreachable!("check id is validated before diagnosis"),
        }
    }

    fn is_admin() -> bool {
        windows_tool::elevated::is_elevated()
    }

    fn remove_process_proxy() {
        for name in PROXY_ENV_NAMES {
            std::env::remove_var(name);
        }
    }

    fn remove_registry_proxy(root: winreg::HKEY, path: &str) -> Result<(), String> {
        let key = match RegKey::predef(root).open_subkey_with_flags(path, KEY_READ | KEY_WRITE) {
            Ok(key) => key,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error.to_string()),
        };
        let names = key
            .enum_values()
            .filter_map(Result::ok)
            .map(|(name, _)| name)
            .filter(|name| {
                PROXY_ENV_NAMES
                    .iter()
                    .any(|candidate| candidate.eq_ignore_ascii_case(name))
            })
            .collect::<Vec<_>>();
        for name in names {
            key.delete_value(name).map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    fn disable_wininet() -> Result<(), String> {
        let key = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags(WININET_PATH, KEY_WRITE)
            .map_err(|error| error.to_string())?;
        key.set_value("ProxyEnable", &0u32)
            .map_err(|error| error.to_string())?;
        key.set_value("AutoDetect", &0u32)
            .map_err(|error| error.to_string())?;
        let _ = key.delete_value("AutoConfigURL");
        Ok(())
    }

    fn run_admin_command(program: &str, args: &[&str]) -> Result<(), String> {
        if !is_admin() {
            return Err("elevation.needAdmin".to_string());
        }
        let output = command_output(program, args)?;
        if output.status.success() {
            Ok(())
        } else {
            let message = decode_process_output(&output.stderr).trim().to_string();
            Err(if message.is_empty() {
                format!("{program} exited with {}", output.status)
            } else {
                message
            })
        }
    }

    pub(super) fn repair(actions: Vec<String>) -> Vec<NetworkRepairActionResult> {
        let mut results = Vec::with_capacity(actions.len());
        for action in actions {
            let outcome = match action.as_str() {
                "clear_process_proxy" => {
                    remove_process_proxy();
                    Ok(false)
                }
                "clear_user_proxy" => {
                    remove_registry_proxy(HKEY_CURRENT_USER, USER_ENV_PATH).map(|_| {
                        remove_process_proxy();
                        false
                    })
                }
                "clear_machine_proxy" => {
                    remove_registry_proxy(HKEY_LOCAL_MACHINE, MACHINE_ENV_PATH).map(|_| false)
                }
                "disable_wininet_proxy" => disable_wininet().map(|_| false),
                "reset_winhttp_proxy" => {
                    run_admin_command("netsh.exe", &["winhttp", "reset", "proxy"]).map(|_| false)
                }
                "flush_dns_cache" => command_output("ipconfig.exe", &["/flushdns"])
                    .and_then(|output| {
                        output
                            .status
                            .success()
                            .then_some(())
                            .ok_or_else(|| "dns.flush_failed".to_string())
                    })
                    .map(|_| false),
                "reset_winsock" => {
                    run_admin_command("netsh.exe", &["winsock", "reset"]).map(|_| true)
                }
                "reset_tcpip" => {
                    run_admin_command("netsh.exe", &["int", "ip", "reset"]).map(|_| true)
                }
                _ => Err("network_repair.invalid_action".to_string()),
            };
            match outcome {
                Ok(restart_required) => results.push(NetworkRepairActionResult::success(
                    &action,
                    restart_required,
                )),
                Err(error) => results.push(NetworkRepairActionResult::failure(&action, &error)),
            }
        }
        results
    }
}

#[cfg(windows)]
fn diagnose_check_inner(check_id: &str) -> IpcResult<NetworkRepairCheck> {
    Ok(windows_impl::diagnose(check_id))
}

#[cfg(not(windows))]
fn diagnose_check_inner(_: &str) -> IpcResult<NetworkRepairCheck> {
    Err(network_repair_error(
        "windows_only",
        "Network repair is only available on Windows",
    ))
}

#[cfg(windows)]
fn repair_inner(actions: Vec<String>) -> IpcResult<Vec<NetworkRepairActionResult>> {
    Ok(windows_impl::repair(actions))
}

#[cfg(not(windows))]
fn repair_inner(_: Vec<String>) -> IpcResult<Vec<NetworkRepairActionResult>> {
    Err(network_repair_error(
        "windows_only",
        "Network repair is only available on Windows",
    ))
}

#[cfg(test)]
mod tests {
    use super::{normalized_actions, normalized_check_id, ACTIONS, CHECK_IDS};

    #[test]
    fn action_selection_is_allowlisted_and_stable() {
        let actions = normalized_actions(vec![
            "reset_tcpip".into(),
            "clear_process_proxy".into(),
            "reset_tcpip".into(),
        ])
        .unwrap();
        assert_eq!(actions, vec!["clear_process_proxy", "reset_tcpip"]);
    }

    #[test]
    fn action_selection_rejects_empty_and_unknown_actions() {
        assert!(normalized_actions(Vec::new()).is_err());
        assert!(normalized_actions(vec!["delete_everything".into()]).is_err());
        assert_eq!(ACTIONS.len(), 8);
    }

    #[test]
    fn diagnostic_check_selection_is_allowlisted_and_ordered() {
        for check_id in CHECK_IDS {
            assert_eq!(normalized_check_id((*check_id).into()).unwrap(), *check_id);
        }
        assert!(normalized_check_id("estimated_progress".into()).is_err());
        assert_eq!(CHECK_IDS.len(), 7);
    }
}
