use crate::ipc_error::{IpcError, IpcResult};
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashSet;

#[cfg(windows)]
static APP_REPAIR_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AppRepairTarget {
    Store,
    OneDrive,
}

impl AppRepairTarget {
    fn parse(value: &str) -> IpcResult<Self> {
        match value {
            "store" => Ok(Self::Store),
            "onedrive" => Ok(Self::OneDrive),
            _ => Err(app_repair_error(
                "invalid_target",
                "Unsupported application repair target",
            )),
        }
    }

    fn check_ids(self) -> &'static [&'static str] {
        match self {
            Self::Store => &[
                "store_package",
                "store_registration",
                "store_appx_services",
                "store_update_services",
                "store_cache_tool",
            ],
            Self::OneDrive => &[
                "onedrive_installation",
                "onedrive_policy",
                "onedrive_cloud_files",
                "onedrive_process",
                "onedrive_accounts",
            ],
        }
    }

    fn action_ids(self) -> &'static [&'static str] {
        match self {
            Self::Store => &[
                "enable_store_services",
                "enable_update_services",
                "reregister_store",
                "reset_store",
            ],
            Self::OneDrive => &[
                "install_onedrive",
                "enable_cldflt",
                "start_onedrive",
                "reset_onedrive",
            ],
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum AppRepairCheckStatus {
    Pass,
    Warning,
    Error,
    Blocked,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRepairCheckResult {
    id: String,
    status: AppRepairCheckStatus,
    detail_code: String,
    params: Map<String, Value>,
    repair_action: Option<String>,
    requires_admin: bool,
}

impl AppRepairCheckResult {
    fn new(id: &str, status: AppRepairCheckStatus, detail_code: &str) -> Self {
        Self {
            id: id.to_string(),
            status,
            detail_code: detail_code.to_string(),
            params: Map::new(),
            repair_action: None,
            requires_admin: false,
        }
    }

    fn with_param(mut self, key: &str, value: impl Into<Value>) -> Self {
        self.params.insert(key.to_string(), value.into());
        self
    }

    fn repair(mut self, action: &str, requires_admin: bool) -> Self {
        self.repair_action = Some(action.to_string());
        self.requires_admin = requires_admin;
        self
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRepairActionResult {
    action: String,
    success: bool,
    error_code: Option<String>,
    restart_required: bool,
}

impl AppRepairActionResult {
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

fn app_repair_error(reason: &str, message: impl Into<String>) -> IpcError {
    IpcError::new(format!("app_repair.{reason}"), message)
}

fn validate_check(target: AppRepairTarget, check_id: &str) -> IpcResult<()> {
    if target.check_ids().contains(&check_id) {
        Ok(())
    } else {
        Err(app_repair_error(
            "invalid_check",
            "Unsupported application repair check",
        ))
    }
}

fn normalized_actions(target: AppRepairTarget, actions: Vec<String>) -> IpcResult<Vec<String>> {
    if actions.is_empty() || actions.len() > target.action_ids().len() * 2 {
        return Err(app_repair_error(
            "invalid_action",
            "Application repair action selection is invalid",
        ));
    }

    let allowed = target.action_ids();
    let requested = actions.into_iter().collect::<HashSet<_>>();
    if requested
        .iter()
        .any(|action| !allowed.contains(&action.as_str()))
    {
        return Err(app_repair_error(
            "invalid_action",
            "Application repair action does not belong to the selected target",
        ));
    }

    Ok(allowed
        .iter()
        .filter(|action| requested.contains(**action))
        .map(|action| (*action).to_string())
        .collect())
}

#[tauri::command]
pub async fn diagnose_app_repair_check(
    target: String,
    check_id: String,
) -> IpcResult<AppRepairCheckResult> {
    let target = AppRepairTarget::parse(&target)?;
    validate_check(target, &check_id)?;
    tokio::task::spawn_blocking(move || diagnose_inner(target, &check_id))
        .await
        .map_err(|error| app_repair_error("operation_failed", error.to_string()))
}

#[tauri::command]
pub async fn repair_app_issues(
    target: String,
    actions: Vec<String>,
) -> IpcResult<Vec<AppRepairActionResult>> {
    let target = AppRepairTarget::parse(&target)?;
    let actions = normalized_actions(target, actions)?;
    tokio::task::spawn_blocking(move || repair_inner(target, actions))
        .await
        .map_err(|error| app_repair_error("operation_failed", error.to_string()))?
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Output};
    use std::thread;
    use std::time::Duration;
    use sysinfo::{ProcessesToUpdate, System};
    use windows_tool::elevated::is_elevated;
    use windows_tool::utils::{
        decode_process_output, run_multiple_commands, CommandHiddenWindowExt, RunCommandOptions,
    };
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const STORE_PACKAGE_SCRIPT: &str = "$package = Get-AppxPackage -Name Microsoft.WindowsStore -ErrorAction SilentlyContinue | Select-Object -First 1; if ($null -eq $package) { 'missing' } else { 'present' }";
    const STORE_REGISTRATION_SCRIPT: &str = "$package = Get-AppxPackage -Name Microsoft.WindowsStore -ErrorAction SilentlyContinue | Select-Object -First 1; if ($null -eq $package) { 'missing' } elseif ($package.Status -ne 'Ok') { 'unhealthy|' + [string]$package.Status } elseif (-not (Test-Path -LiteralPath (Join-Path $package.InstallLocation 'AppxManifest.xml'))) { 'manifest_missing' } else { 'healthy' }";
    const REREGISTER_STORE_COMMAND: &str = "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \"$package = Get-AppxPackage -AllUsers -Name Microsoft.WindowsStore -ErrorAction SilentlyContinue | Select-Object -First 1; if ($null -eq $package) { exit 2 }; Add-AppxPackage -DisableDevelopmentMode -Register (Join-Path $package.InstallLocation 'AppxManifest.xml') -ErrorAction Stop\"";
    const RESET_STORE_SCRIPT: &str = "$package = Get-AppxPackage -Name Microsoft.WindowsStore -ErrorAction SilentlyContinue | Select-Object -First 1; if ($null -eq $package) { exit 2 }; $reset = Get-Command Reset-AppxPackage -ErrorAction SilentlyContinue; if ($null -ne $reset) { $package | Reset-AppxPackage -ErrorAction Stop }; $process = Start-Process -FilePath 'wsreset.exe' -Wait -PassThru; if ($null -eq $process -or $process.ExitCode -ne 0) { exit 3 }";

    fn command_output(program: &str, args: &[&str]) -> Result<Output, String> {
        Command::new(program)
            .with_hidden_window()
            .args(args)
            .output()
            .map_err(|error| error.to_string())
    }

    fn run_powershell(script: &str) -> Result<String, String> {
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

    fn service_start_value(name: &str) -> Result<u32, String> {
        RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey(format!(r"SYSTEM\CurrentControlSet\Services\{name}"))
            .and_then(|key| key.get_value("Start"))
            .map_err(|error| error.to_string())
    }

    fn check_services(id: &str, services: &[&str], repair_action: &str) -> AppRepairCheckResult {
        let mut disabled = Vec::new();
        let mut missing = Vec::new();
        for name in services {
            match service_start_value(name) {
                Ok(4) => disabled.push(*name),
                Ok(_) => {}
                Err(_) => missing.push(*name),
            }
        }
        if !missing.is_empty() {
            AppRepairCheckResult::new(id, AppRepairCheckStatus::Error, "unavailable")
                .with_param("services", missing.join(", "))
        } else if disabled.is_empty() {
            AppRepairCheckResult::new(id, AppRepairCheckStatus::Pass, "healthy")
        } else {
            AppRepairCheckResult::new(id, AppRepairCheckStatus::Warning, "disabled")
                .with_param("services", disabled.join(", "))
                .repair(repair_action, true)
        }
    }

    fn check_store_package() -> AppRepairCheckResult {
        match run_powershell(STORE_PACKAGE_SCRIPT).as_deref() {
            Ok("present") => {
                AppRepairCheckResult::new("store_package", AppRepairCheckStatus::Pass, "installed")
            }
            Ok("missing") => {
                AppRepairCheckResult::new("store_package", AppRepairCheckStatus::Error, "missing")
                    .repair("reregister_store", true)
            }
            _ => AppRepairCheckResult::new(
                "store_package",
                AppRepairCheckStatus::Warning,
                "unavailable",
            ),
        }
    }

    fn check_store_registration() -> AppRepairCheckResult {
        match run_powershell(STORE_REGISTRATION_SCRIPT) {
            Ok(value) if value == "healthy" => AppRepairCheckResult::new(
                "store_registration",
                AppRepairCheckStatus::Pass,
                "healthy",
            ),
            Ok(value) if value == "missing" => AppRepairCheckResult::new(
                "store_registration",
                AppRepairCheckStatus::Error,
                "missing",
            )
            .repair("reregister_store", true),
            Ok(value) if value == "manifest_missing" => AppRepairCheckResult::new(
                "store_registration",
                AppRepairCheckStatus::Error,
                "manifestMissing",
            )
            .repair("reregister_store", true),
            Ok(value) if value.starts_with("unhealthy|") => AppRepairCheckResult::new(
                "store_registration",
                AppRepairCheckStatus::Warning,
                "unhealthy",
            )
            .with_param("status", value.trim_start_matches("unhealthy|"))
            .repair("reregister_store", true),
            _ => AppRepairCheckResult::new(
                "store_registration",
                AppRepairCheckStatus::Warning,
                "unavailable",
            ),
        }
    }

    fn check_store_cache_tool() -> AppRepairCheckResult {
        let present = std::env::var_os("SYSTEMROOT")
            .map(PathBuf::from)
            .map(|root| root.join("System32").join("wsreset.exe").is_file())
            .unwrap_or(false);
        AppRepairCheckResult::new(
            "store_cache_tool",
            if present {
                AppRepairCheckStatus::Pass
            } else {
                AppRepairCheckStatus::Error
            },
            if present { "available" } else { "missing" },
        )
    }

    fn env_path(name: &str, suffix: &[&str]) -> Option<PathBuf> {
        let mut path = PathBuf::from(std::env::var_os(name)?);
        for part in suffix {
            path.push(part);
        }
        Some(path)
    }

    fn first_existing(paths: impl IntoIterator<Item = Option<PathBuf>>) -> Option<PathBuf> {
        paths.into_iter().flatten().find(|path| path.is_file())
    }

    fn onedrive_executable() -> Option<PathBuf> {
        first_existing([
            env_path("LOCALAPPDATA", &["Microsoft", "OneDrive", "OneDrive.exe"]),
            env_path("ProgramFiles", &["Microsoft OneDrive", "OneDrive.exe"]),
            env_path("ProgramFiles(x86)", &["Microsoft OneDrive", "OneDrive.exe"]),
        ])
    }

    fn onedrive_setup() -> Option<PathBuf> {
        first_existing([
            env_path("SYSTEMROOT", &["SysWOW64", "OneDriveSetup.exe"]),
            env_path("SYSTEMROOT", &["System32", "OneDriveSetup.exe"]),
            env_path(
                "LOCALAPPDATA",
                &["Microsoft", "OneDrive", "Update", "OneDriveSetup.exe"],
            ),
        ])
    }

    fn policy_value(root: winreg::HKEY) -> Result<Option<u32>, String> {
        match RegKey::predef(root).open_subkey(r"SOFTWARE\Policies\Microsoft\Windows\OneDrive") {
            Ok(key) => match key.get_value("DisableFileSyncNGSC") {
                Ok(value) => Ok(Some(value)),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(error) => Err(error.to_string()),
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    fn check_onedrive_installation() -> AppRepairCheckResult {
        if let Some(path) = onedrive_executable() {
            AppRepairCheckResult::new(
                "onedrive_installation",
                AppRepairCheckStatus::Pass,
                "installed",
            )
            .with_param("path", path.to_string_lossy().to_string())
        } else if onedrive_setup().is_some() {
            AppRepairCheckResult::new(
                "onedrive_installation",
                AppRepairCheckStatus::Error,
                "missingSetupAvailable",
            )
            .repair("install_onedrive", false)
        } else {
            AppRepairCheckResult::new(
                "onedrive_installation",
                AppRepairCheckStatus::Error,
                "missing",
            )
        }
    }

    fn check_onedrive_policy() -> AppRepairCheckResult {
        match (
            policy_value(HKEY_LOCAL_MACHINE),
            policy_value(HKEY_CURRENT_USER),
        ) {
            (Ok(Some(1)), _) => AppRepairCheckResult::new(
                "onedrive_policy",
                AppRepairCheckStatus::Blocked,
                "blockedMachine",
            ),
            (_, Ok(Some(1))) => AppRepairCheckResult::new(
                "onedrive_policy",
                AppRepairCheckStatus::Blocked,
                "blockedUser",
            ),
            (Ok(_), Ok(_)) => {
                AppRepairCheckResult::new("onedrive_policy", AppRepairCheckStatus::Pass, "allowed")
            }
            _ => AppRepairCheckResult::new(
                "onedrive_policy",
                AppRepairCheckStatus::Warning,
                "unavailable",
            ),
        }
    }

    fn check_onedrive_cloud_files() -> AppRepairCheckResult {
        match service_start_value("CldFlt") {
            Ok(2) => AppRepairCheckResult::new(
                "onedrive_cloud_files",
                AppRepairCheckStatus::Pass,
                "automatic",
            ),
            Ok(value) => AppRepairCheckResult::new(
                "onedrive_cloud_files",
                AppRepairCheckStatus::Warning,
                "wrongStartType",
            )
            .with_param("value", value)
            .repair("enable_cldflt", true),
            Err(_) => AppRepairCheckResult::new(
                "onedrive_cloud_files",
                AppRepairCheckStatus::Error,
                "unavailable",
            ),
        }
    }

    fn check_onedrive_process() -> AppRepairCheckResult {
        if onedrive_executable().is_none() {
            return AppRepairCheckResult::new(
                "onedrive_process",
                AppRepairCheckStatus::Warning,
                "notInstalled",
            );
        }
        let mut system = System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);
        let running = system.processes().values().any(|process| {
            process
                .name()
                .to_string_lossy()
                .eq_ignore_ascii_case("OneDrive.exe")
        });
        if running {
            AppRepairCheckResult::new("onedrive_process", AppRepairCheckStatus::Pass, "running")
        } else {
            AppRepairCheckResult::new(
                "onedrive_process",
                AppRepairCheckStatus::Warning,
                "notRunning",
            )
            .repair("start_onedrive", false)
        }
    }

    fn check_onedrive_accounts() -> AppRepairCheckResult {
        let accounts = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\Microsoft\OneDrive\Accounts")
            .ok()
            .map(|key| key.enum_keys().filter_map(Result::ok).count())
            .unwrap_or(0);
        if accounts > 0 {
            AppRepairCheckResult::new(
                "onedrive_accounts",
                AppRepairCheckStatus::Pass,
                "configured",
            )
            .with_param("count", accounts as u64)
        } else {
            AppRepairCheckResult::new(
                "onedrive_accounts",
                AppRepairCheckStatus::Pass,
                "notConfigured",
            )
        }
    }

    pub(super) fn diagnose(target: AppRepairTarget, check_id: &str) -> AppRepairCheckResult {
        match (target, check_id) {
            (AppRepairTarget::Store, "store_package") => check_store_package(),
            (AppRepairTarget::Store, "store_registration") => check_store_registration(),
            (AppRepairTarget::Store, "store_appx_services") => check_services(
                check_id,
                &["AppXSvc", "ClipSVC", "InstallService"],
                "enable_store_services",
            ),
            (AppRepairTarget::Store, "store_update_services") => {
                check_services(check_id, &["BITS", "wuauserv"], "enable_update_services")
            }
            (AppRepairTarget::Store, "store_cache_tool") => check_store_cache_tool(),
            (AppRepairTarget::OneDrive, "onedrive_installation") => check_onedrive_installation(),
            (AppRepairTarget::OneDrive, "onedrive_policy") => check_onedrive_policy(),
            (AppRepairTarget::OneDrive, "onedrive_cloud_files") => check_onedrive_cloud_files(),
            (AppRepairTarget::OneDrive, "onedrive_process") => check_onedrive_process(),
            (AppRepairTarget::OneDrive, "onedrive_accounts") => check_onedrive_accounts(),
            _ => AppRepairCheckResult::new(check_id, AppRepairCheckStatus::Warning, "unavailable"),
        }
    }

    fn disabled_service_commands(services: &[&str]) -> Vec<String> {
        services
            .iter()
            .filter(|name| service_start_value(name).ok() == Some(4))
            .map(|name| format!("sc.exe config {name} start= demand"))
            .collect()
    }

    fn admin_commands(actions: &[String]) -> Vec<String> {
        let mut commands = Vec::new();
        for action in actions {
            match action.as_str() {
                "enable_store_services" => commands.extend(disabled_service_commands(&[
                    "AppXSvc",
                    "ClipSVC",
                    "InstallService",
                ])),
                "enable_update_services" => {
                    commands.extend(disabled_service_commands(&["BITS", "wuauserv"]))
                }
                "reregister_store" => commands.push(REREGISTER_STORE_COMMAND.to_string()),
                "enable_cldflt" => commands.push("sc.exe config CldFlt start= auto".to_string()),
                _ => {}
            }
        }
        commands
    }

    fn is_admin_action(action: &str) -> bool {
        matches!(
            action,
            "enable_store_services"
                | "enable_update_services"
                | "reregister_store"
                | "enable_cldflt"
        )
    }

    fn run_admin_batch(actions: &[String]) -> Result<(), String> {
        let commands = admin_commands(actions);
        if commands.is_empty() {
            return Ok(());
        }
        run_multiple_commands(
            &commands,
            RunCommandOptions::new(true, !is_elevated(), false),
        )
        .map(|_| ())
    }

    fn run_executable(path: &Path, argument: Option<&str>, wait: bool) -> Result<(), String> {
        let mut command = Command::new(path);
        command.with_hidden_window();
        if let Some(argument) = argument {
            command.arg(argument);
        }
        if wait {
            let status = command.status().map_err(|error| error.to_string())?;
            if !status.success() {
                return Err(format!("process exited with status {status}"));
            }
        } else {
            command.spawn().map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    fn run_user_action(action: &str) -> Result<bool, String> {
        match action {
            "reset_store" => run_powershell(RESET_STORE_SCRIPT).map(|_| false),
            "install_onedrive" => {
                let setup =
                    onedrive_setup().ok_or_else(|| "OneDriveSetup.exe missing".to_string())?;
                run_executable(&setup, Some("/silent"), true)?;
                onedrive_executable()
                    .map(|_| false)
                    .ok_or_else(|| "OneDrive installation did not complete".to_string())
            }
            "start_onedrive" => {
                let executable =
                    onedrive_executable().ok_or_else(|| "OneDrive.exe missing".to_string())?;
                run_executable(&executable, None, false).map(|_| false)
            }
            "reset_onedrive" => {
                let executable =
                    onedrive_executable().ok_or_else(|| "OneDrive.exe missing".to_string())?;
                run_executable(&executable, Some("/reset"), true)?;
                thread::sleep(Duration::from_secs(2));
                run_executable(&executable, None, false).map(|_| false)
            }
            _ => Err("unsupported user action".to_string()),
        }
    }

    pub(super) fn repair(actions: Vec<String>) -> Vec<AppRepairActionResult> {
        let policy_blocked = policy_value(HKEY_LOCAL_MACHINE).ok().flatten() == Some(1)
            || policy_value(HKEY_CURRENT_USER).ok().flatten() == Some(1);
        let targets_onedrive = actions.iter().any(|action| {
            matches!(
                action.as_str(),
                "install_onedrive" | "enable_cldflt" | "start_onedrive" | "reset_onedrive"
            )
        });
        if policy_blocked && targets_onedrive {
            return actions
                .into_iter()
                .map(|action| AppRepairActionResult::failure(&action, "policyBlocked"))
                .collect();
        }

        let admin_actions = actions
            .iter()
            .filter(|action| is_admin_action(action))
            .cloned()
            .collect::<Vec<_>>();
        let admin_result = run_admin_batch(&admin_actions);

        actions
            .into_iter()
            .map(|action| {
                if is_admin_action(&action) {
                    match &admin_result {
                        Ok(()) => {
                            AppRepairActionResult::success(&action, action == "enable_cldflt")
                        }
                        Err(_) => AppRepairActionResult::failure(&action, "adminFailed"),
                    }
                } else {
                    match run_user_action(&action) {
                        Ok(restart_required) => {
                            AppRepairActionResult::success(&action, restart_required)
                        }
                        Err(_) => AppRepairActionResult::failure(&action, "actionFailed"),
                    }
                }
            })
            .collect()
    }
}

#[cfg(windows)]
fn diagnose_inner(target: AppRepairTarget, check_id: &str) -> AppRepairCheckResult {
    windows_impl::diagnose(target, check_id)
}

#[cfg(not(windows))]
fn diagnose_inner(_target: AppRepairTarget, check_id: &str) -> AppRepairCheckResult {
    AppRepairCheckResult::new(check_id, AppRepairCheckStatus::Error, "windowsOnly")
}

#[cfg(windows)]
fn repair_inner(
    _target: AppRepairTarget,
    actions: Vec<String>,
) -> IpcResult<Vec<AppRepairActionResult>> {
    let _guard = APP_REPAIR_LOCK.try_lock().map_err(|_| {
        app_repair_error(
            "repair_in_progress",
            "An application repair is already in progress",
        )
    })?;
    Ok(windows_impl::repair(actions))
}

#[cfg(not(windows))]
fn repair_inner(
    _target: AppRepairTarget,
    actions: Vec<String>,
) -> IpcResult<Vec<AppRepairActionResult>> {
    Ok(actions
        .into_iter()
        .map(|action| AppRepairActionResult::failure(&action, "windowsOnly"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_cross_target_and_unknown_actions() {
        assert!(
            normalized_actions(AppRepairTarget::Store, vec!["reset_onedrive".to_string()]).is_err()
        );
        assert!(normalized_actions(
            AppRepairTarget::OneDrive,
            vec!["delete_everything".to_string()]
        )
        .is_err());
    }

    #[test]
    fn deduplicates_and_orders_actions_by_target_contract() {
        let actions = normalized_actions(
            AppRepairTarget::Store,
            vec![
                "reset_store".to_string(),
                "reregister_store".to_string(),
                "reset_store".to_string(),
            ],
        )
        .unwrap();
        assert_eq!(actions, vec!["reregister_store", "reset_store"]);
    }

    #[test]
    fn validates_each_targets_check_catalog() {
        assert!(validate_check(AppRepairTarget::Store, "store_package").is_ok());
        assert!(validate_check(AppRepairTarget::OneDrive, "store_package").is_err());
    }
}
