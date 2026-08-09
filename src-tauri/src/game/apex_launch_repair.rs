//! Apex launch diagnostics and explicit, allowlisted repair actions.

use crate::game::{apex, ea_desktop};
use crate::ipc_error::{IpcError, IpcResult};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(windows)]
static APEX_LAUNCH_REPAIR_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

const CHECK_IDS: &[&str] = &[
    "installation",
    "processes",
    "game_files",
    "anti_cheat",
    "crash_logs",
    "configuration",
    "apex_cache",
    "shader_cache",
    "runtime",
    "conflicts",
];

const ACTION_ORDER: &[&str] = &[
    "close_apex",
    "close_launcher",
    "close_conflicting_apps",
    "clear_apex_pso_cache",
    "clear_apex_assets_cache",
    "clear_eac_cache",
    "clear_directx_shader_cache",
    "clear_nvidia_shader_cache",
    "remove_stale_eac_driver",
    "repair_eac",
    "repair_windows_components",
];

const CONFLICT_PROCESS_NAMES: &[&str] = &[
    "discord.exe",
    "gamebar.exe",
    "gamebarftserver.exe",
    "gameoverlayui.exe",
    "nvsphelper64.exe",
    "nvidia overlay.exe",
    "rtss.exe",
    "msiafterburner.exe",
    "radeonsoftware.exe",
    "ds4windows.exe",
    "autohotkey.exe",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexLaunchRepairTarget {
    launcher: String,
    account_id: String,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
enum Launcher {
    Steam,
    Ea,
}

impl ApexLaunchRepairTarget {
    fn launcher(&self) -> Result<Launcher, String> {
        if self.account_id.is_empty()
            || !self
                .account_id
                .chars()
                .all(|character| character.is_ascii_digit())
        {
            return Err("invalid_account".to_string());
        }
        match self.launcher.as_str() {
            "steam" => {
                self.account_id
                    .parse::<usize>()
                    .map_err(|_| "invalid_account".to_string())?;
                Ok(Launcher::Steam)
            }
            "ea" => Ok(Launcher::Ea),
            _ => Err("invalid_target".to_string()),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ApexLaunchRepairCheckStatus {
    Pass,
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ApexLaunchRepairActionMode {
    Batch,
    Confirm,
    External,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexLaunchRepairAction {
    id: String,
    mode: ApexLaunchRepairActionMode,
    requires_admin: bool,
    restart_required: bool,
    recommended: bool,
}

impl ApexLaunchRepairAction {
    fn batch(id: &str, requires_admin: bool, restart_required: bool, recommended: bool) -> Self {
        Self {
            id: id.to_string(),
            mode: ApexLaunchRepairActionMode::Batch,
            requires_admin,
            restart_required,
            recommended,
        }
    }

    fn confirm(id: &str) -> Self {
        Self {
            id: id.to_string(),
            mode: ApexLaunchRepairActionMode::Confirm,
            requires_admin: false,
            restart_required: false,
            recommended: false,
        }
    }

    fn external(id: &str) -> Self {
        Self {
            id: id.to_string(),
            mode: ApexLaunchRepairActionMode::External,
            requires_admin: false,
            restart_required: false,
            recommended: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexLaunchRepairCheckResult {
    id: String,
    status: ApexLaunchRepairCheckStatus,
    detail_code: String,
    params: Map<String, Value>,
    actions: Vec<ApexLaunchRepairAction>,
}

impl ApexLaunchRepairCheckResult {
    fn new(id: &str, status: ApexLaunchRepairCheckStatus, detail_code: &str) -> Self {
        Self {
            id: id.to_string(),
            status,
            detail_code: detail_code.to_string(),
            params: Map::new(),
            actions: Vec::new(),
        }
    }

    fn with_param(mut self, key: &str, value: impl Into<Value>) -> Self {
        self.params.insert(key.to_string(), value.into());
        self
    }

    fn with_actions(mut self, actions: Vec<ApexLaunchRepairAction>) -> Self {
        self.actions = actions;
        self
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexLaunchRepairActionResult {
    action: String,
    success: bool,
    error_code: Option<String>,
    restart_required: bool,
    changed_items: Vec<String>,
}

impl ApexLaunchRepairActionResult {
    fn success(action: &str, restart_required: bool, changed_items: Vec<String>) -> Self {
        Self {
            action: action.to_string(),
            success: true,
            error_code: None,
            restart_required,
            changed_items,
        }
    }

    fn failure(action: &str, error_code: impl Into<String>) -> Self {
        Self {
            action: action.to_string(),
            success: false,
            error_code: Some(error_code.into()),
            restart_required: false,
            changed_items: Vec::new(),
        }
    }
}

fn repair_error(reason: &str, message: impl Into<String>) -> IpcError {
    IpcError::new(format!("apex_launch_repair.{reason}"), message)
}

fn normalize_check_id(check_id: String) -> IpcResult<String> {
    if CHECK_IDS.contains(&check_id.as_str()) {
        Ok(check_id)
    } else {
        Err(repair_error(
            "invalid_check",
            "Unsupported Apex launch diagnostic check",
        ))
    }
}

fn normalized_actions(actions: Vec<String>) -> IpcResult<Vec<String>> {
    if actions.is_empty() || actions.len() > ACTION_ORDER.len() * 2 {
        return Err(repair_error(
            "invalid_action",
            "Apex launch repair action selection is invalid",
        ));
    }
    let requested = actions.into_iter().collect::<HashSet<_>>();
    if requested
        .iter()
        .any(|action| !ACTION_ORDER.contains(&action.as_str()))
    {
        return Err(repair_error(
            "invalid_action",
            "Unsupported Apex launch repair action",
        ));
    }
    Ok(ACTION_ORDER
        .iter()
        .filter(|action| requested.contains(**action))
        .map(|action| (*action).to_string())
        .collect())
}

fn steam_install_root(library_root: &Path) -> PathBuf {
    library_root
        .join("steamapps")
        .join("common")
        .join("Apex Legends")
}

fn parse_ea_install_root(content: &str) -> Option<PathBuf> {
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with(';'))
        .filter_map(|line| line.split_once('='))
        .find(|(key, _)| key.trim().eq_ignore_ascii_case("user.downloadinplacedir"))
        .map(|(_, value)| value.trim().trim_matches('"'))
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .map(|root| root.join("Apex"))
}

fn is_safe_descendant(root: &Path, candidate: &Path) -> bool {
    let Ok(relative) = candidate.strip_prefix(root) else {
        return false;
    };
    !relative.as_os_str().is_empty()
        && relative
            .components()
            .all(|component| matches!(component, std::path::Component::Normal(_)))
}

#[tauri::command]
pub async fn diagnose_apex_launch_repair_check(
    target: ApexLaunchRepairTarget,
    check_id: String,
) -> IpcResult<ApexLaunchRepairCheckResult> {
    target
        .launcher()
        .map_err(|reason| repair_error(&reason, "Invalid Apex launcher account"))?;
    let check_id = normalize_check_id(check_id)?;
    tokio::task::spawn_blocking(move || diagnose_inner(&target, &check_id))
        .await
        .map_err(|error| repair_error("operation_failed", error.to_string()))?
}

#[tauri::command]
pub async fn repair_apex_launch_issues(
    target: ApexLaunchRepairTarget,
    actions: Vec<String>,
) -> IpcResult<Vec<ApexLaunchRepairActionResult>> {
    target
        .launcher()
        .map_err(|reason| repair_error(&reason, "Invalid Apex launcher account"))?;
    let actions = normalized_actions(actions)?;
    tokio::task::spawn_blocking(move || repair_inner(target, actions))
        .await
        .map_err(|error| repair_error("operation_failed", error.to_string()))?
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::process::Command;
    use sysinfo::{ProcessesToUpdate, System};
    use windows_tool::elevated::is_elevated;
    use windows_tool::game::apex::{
        get_apex_config_path, get_apex_local_folder_path, get_apex_saved_games_root,
        ApexCfgDocument, ApexConfigFileKind,
    };
    use windows_tool::game::steam::get_steam_game_library_folder_by_game_id;
    use windows_tool::utils::{
        decode_process_output, run_multiple_commands, CommandHiddenWindowExt, RunCommandOptions,
    };
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    fn process_names() -> Vec<String> {
        let mut system = System::new_all();
        system.refresh_processes(ProcessesToUpdate::All, true);
        system
            .processes()
            .values()
            .map(|process| process.name().to_string_lossy().to_ascii_lowercase())
            .collect()
    }

    fn matching_processes(candidates: &[&str]) -> Vec<String> {
        let candidates = candidates
            .iter()
            .map(|name| name.to_ascii_lowercase())
            .collect::<HashSet<_>>();
        let mut found = process_names()
            .into_iter()
            .filter(|name| candidates.contains(name))
            .collect::<Vec<_>>();
        found.sort();
        found.dedup();
        found
    }

    fn ea_install_root(account_id: &str) -> Result<PathBuf, String> {
        let local = std::env::var("LOCALAPPDATA").map_err(|_| "local_app_data_missing")?;
        let ini = PathBuf::from(local)
            .join("Electronic Arts")
            .join("EA Desktop")
            .join(format!("user_{account_id}.ini"));
        let content = fs::read_to_string(&ini).map_err(|_| "ea_account_config_missing")?;
        parse_ea_install_root(&content).ok_or_else(|| "ea_install_path_missing".to_string())
    }

    fn install_root(target: &ApexLaunchRepairTarget) -> Result<PathBuf, String> {
        match target.launcher()? {
            Launcher::Steam => Ok(steam_install_root(&PathBuf::from(
                get_steam_game_library_folder_by_game_id(1_172_470)?,
            ))),
            Launcher::Ea => ea_install_root(&target.account_id),
        }
    }

    fn launch_options(target: &ApexLaunchRepairTarget) -> Result<String, String> {
        match target.launcher()? {
            Launcher::Steam => apex::read_steam_launch_options(
                target
                    .account_id
                    .parse::<usize>()
                    .map_err(|_| "invalid_account")?,
            ),
            Launcher::Ea => ea_desktop::read_ea_launch_options(&target.account_id),
        }
    }

    fn launcher_processes(launcher: Launcher) -> &'static [&'static str] {
        match launcher {
            Launcher::Steam => &["steam.exe", "steamwebhelper.exe"],
            Launcher::Ea => &[
                "eadesktop.exe",
                "ealauncher.exe",
                "eabackgroundagent.exe",
                "easteamproxy.exe",
                "link2ea.exe",
            ],
        }
    }

    fn find_eac_setup(root: &Path) -> Option<PathBuf> {
        [
            root.join("EasyAntiCheat")
                .join("EasyAntiCheat_EOS_Setup.exe"),
            root.join("EasyAntiCheat").join("EasyAntiCheat_Setup.exe"),
            root.join("EasyAntiCheat_EOS_Setup.exe"),
        ]
        .into_iter()
        .find(|path| path.is_file())
    }

    fn eac_settings(root: &Path) -> Option<PathBuf> {
        [
            root.join("EasyAntiCheat").join("Settings.json"),
            root.join("EasyAntiCheat").join("settings.json"),
        ]
        .into_iter()
        .find(|path| path.is_file())
    }

    fn eac_product_id(root: &Path) -> Option<String> {
        let text = fs::read_to_string(eac_settings(root)?).ok()?;
        parse_eac_product_id(&text)
    }

    fn eac_service_state() -> &'static str {
        for service in ["EasyAntiCheat_EOS", "EasyAntiCheat"] {
            let Ok(output) = Command::new("sc.exe")
                .with_hidden_window()
                .args(["query", service])
                .output()
            else {
                continue;
            };
            if !output.status.success() {
                continue;
            }
            let text = format!(
                "{}\n{}",
                decode_process_output(&output.stdout),
                decode_process_output(&output.stderr)
            )
            .to_ascii_lowercase();
            return if text.contains("running") || text.contains(" 4 ") {
                "running"
            } else {
                "stopped"
            };
        }
        "missing"
    }

    fn eac_driver_paths() -> Vec<PathBuf> {
        let Some(program_files) = std::env::var_os("ProgramFiles(x86)") else {
            return Vec::new();
        };
        let root = PathBuf::from(program_files);
        [
            root.join("EasyAntiCheat").join("EasyAntiCheat.sys"),
            root.join("EasyAntiCheat_EOS").join("EasyAntiCheat_EOS.sys"),
        ]
        .into_iter()
        .filter(|path| path.is_file())
        .collect()
    }

    fn tail_text(path: &Path, max_bytes: usize) -> String {
        let Ok(bytes) = fs::read(path) else {
            return String::new();
        };
        let start = bytes.len().saturating_sub(max_bytes);
        String::from_utf8_lossy(&bytes[start..]).to_string()
    }

    fn collect_named_files(root: &Path, names: &[&str], depth: usize, output: &mut Vec<PathBuf>) {
        if depth == 0 {
            return;
        }
        let Ok(entries) = fs::read_dir(root) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = fs::symlink_metadata(&path) else {
                continue;
            };
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                collect_named_files(&path, names, depth - 1, output);
            } else if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    names
                        .iter()
                        .any(|candidate| name.eq_ignore_ascii_case(candidate))
                })
            {
                output.push(path);
            }
        }
    }

    fn eac_log_text() -> String {
        let Some(app_data) = std::env::var_os("APPDATA") else {
            return String::new();
        };
        let root = PathBuf::from(app_data).join("EasyAntiCheat");
        let mut logs = Vec::new();
        collect_named_files(
            &root,
            &["service.log", "anticheatlauncher.log"],
            4,
            &mut logs,
        );
        logs.sort_by_key(|path| {
            fs::metadata(path)
                .and_then(|metadata| metadata.modified())
                .unwrap_or(UNIX_EPOCH)
        });
        logs.into_iter()
            .rev()
            .take(8)
            .map(|path| tail_text(&path, 128 * 1024))
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn file_tree_size(path: &Path, depth: usize) -> u64 {
        let Ok(metadata) = fs::symlink_metadata(path) else {
            return 0;
        };
        if metadata.file_type().is_symlink() {
            return 0;
        }
        if metadata.is_file() {
            return metadata.len();
        }
        if depth == 0 {
            return 0;
        }
        fs::read_dir(path)
            .ok()
            .into_iter()
            .flatten()
            .flatten()
            .map(|entry| file_tree_size(&entry.path(), depth - 1))
            .sum()
    }

    fn shader_cache_paths() -> (Vec<PathBuf>, Vec<PathBuf>) {
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
        let directx = local
            .as_ref()
            .map(|root| vec![root.join("D3DSCache")])
            .unwrap_or_default();
        let mut nvidia = Vec::new();
        if let Some(root) = local {
            nvidia.push(root.join("NVIDIA").join("DXCache"));
            nvidia.push(root.join("NVIDIA").join("GLCache"));
            nvidia.push(root.join("NVIDIA Corporation").join("NV_Cache"));
        }
        (directx, nvidia)
    }

    fn check_installation(target: &ApexLaunchRepairTarget) -> ApexLaunchRepairCheckResult {
        let launcher = target.launcher().expect("validated target");
        let running = matching_processes(launcher_processes(launcher));
        match install_root(target) {
            Ok(path) if path.is_dir() => {
                let mut actions = vec![
                    ApexLaunchRepairAction::external("open_game_repair"),
                    ApexLaunchRepairAction::external("open_launcher_cache"),
                    ApexLaunchRepairAction::external("open_network_repair"),
                    ApexLaunchRepairAction::external("open_server_status"),
                ];
                if !running.is_empty() {
                    actions.push(ApexLaunchRepairAction::batch(
                        "close_launcher",
                        false,
                        false,
                        true,
                    ));
                }
                ApexLaunchRepairCheckResult::new(
                    "installation",
                    ApexLaunchRepairCheckStatus::Pass,
                    "found",
                )
                .with_param("path", path.to_string_lossy().to_string())
                .with_param("launcher", target.launcher.clone())
                .with_param("launcherRunning", !running.is_empty())
                .with_actions(actions)
            }
            _ => ApexLaunchRepairCheckResult::new(
                "installation",
                ApexLaunchRepairCheckStatus::Error,
                "missing",
            )
            .with_param("launcher", target.launcher.clone())
            .with_actions(vec![ApexLaunchRepairAction::external("open_game_repair")]),
        }
    }

    fn check_processes(target: &ApexLaunchRepairTarget) -> ApexLaunchRepairCheckResult {
        let launcher = target.launcher().expect("validated target");
        let apex_processes =
            matching_processes(&["r5apex.exe", "r5apex_dx12.exe", "start_protected_game.exe"]);
        let launcher_running = !matching_processes(launcher_processes(launcher)).is_empty();
        let mut actions = Vec::new();
        if !apex_processes.is_empty() {
            actions.push(ApexLaunchRepairAction::batch(
                "close_apex",
                false,
                false,
                true,
            ));
        }
        if launcher_running {
            actions.push(ApexLaunchRepairAction::batch(
                "close_launcher",
                false,
                false,
                false,
            ));
        }
        ApexLaunchRepairCheckResult::new(
            "processes",
            if apex_processes.is_empty() {
                ApexLaunchRepairCheckStatus::Pass
            } else {
                ApexLaunchRepairCheckStatus::Warning
            },
            if apex_processes.is_empty() {
                "available"
            } else {
                "apexRunning"
            },
        )
        .with_param("processes", apex_processes.join(", "))
        .with_param("launcherRunning", launcher_running)
        .with_actions(actions)
    }

    fn check_game_files(target: &ApexLaunchRepairTarget) -> ApexLaunchRepairCheckResult {
        let Ok(root) = install_root(target) else {
            return ApexLaunchRepairCheckResult::new(
                "game_files",
                ApexLaunchRepairCheckStatus::Error,
                "installationMissing",
            )
            .with_actions(vec![ApexLaunchRepairAction::external("open_game_repair")]);
        };
        let executables = [root.join("r5apex.exe"), root.join("r5apex_dx12.exe")];
        let found = executables.iter().filter(|path| path.is_file()).count();
        ApexLaunchRepairCheckResult::new(
            "game_files",
            if found > 0 {
                ApexLaunchRepairCheckStatus::Pass
            } else {
                ApexLaunchRepairCheckStatus::Error
            },
            if found > 0 {
                "present"
            } else {
                "executableMissing"
            },
        )
        .with_param("path", root.to_string_lossy().to_string())
        .with_param("executables", found as u64)
        .with_actions(vec![ApexLaunchRepairAction::external("open_game_repair")])
    }

    fn check_anti_cheat(target: &ApexLaunchRepairTarget) -> ApexLaunchRepairCheckResult {
        let Ok(root) = install_root(target) else {
            return ApexLaunchRepairCheckResult::new(
                "anti_cheat",
                ApexLaunchRepairCheckStatus::Error,
                "installationMissing",
            );
        };
        let setup = find_eac_setup(&root);
        let product_id = eac_product_id(&root);
        let service_state = eac_service_state();
        let logs = eac_log_text();
        let signature = classify_eac_log(&logs);
        let mut actions = Vec::new();
        if setup.is_some() && product_id.is_some() {
            actions.push(ApexLaunchRepairAction::batch(
                "repair_eac",
                true,
                false,
                signature != "healthy" || service_state == "missing",
            ));
        }
        if product_id.is_some() {
            actions.push(ApexLaunchRepairAction::batch(
                "clear_eac_cache",
                false,
                false,
                matches!(signature, "integrity" | "launchFailed"),
            ));
        }
        let drivers = eac_driver_paths();
        if signature == "error30005" && !drivers.is_empty() {
            actions.push(ApexLaunchRepairAction::batch(
                "remove_stale_eac_driver",
                true,
                true,
                true,
            ));
        }
        actions.push(ApexLaunchRepairAction::external("open_game_repair"));
        ApexLaunchRepairCheckResult::new(
            "anti_cheat",
            if setup.is_none()
                || product_id.is_none()
                || service_state == "missing"
                || matches!(signature, "error30005" | "integrity" | "launchFailed")
            {
                ApexLaunchRepairCheckStatus::Warning
            } else {
                ApexLaunchRepairCheckStatus::Pass
            },
            if setup.is_none() {
                "setupMissing"
            } else if product_id.is_none() {
                "settingsMissing"
            } else if service_state == "missing" {
                "serviceMissing"
            } else {
                signature
            },
        )
        .with_param(
            "setupPath",
            setup
                .as_ref()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default(),
        )
        .with_param("driverCount", drivers.len() as u64)
        .with_param("serviceState", service_state)
        .with_actions(actions)
    }

    fn check_crash_logs(target: &ApexLaunchRepairTarget) -> ApexLaunchRepairCheckResult {
        let document_log = std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .map(|path| path.join("Documents").join("apex_crash.txt"));
        let crash_text = document_log
            .as_ref()
            .map(|path| tail_text(path, 256 * 1024))
            .unwrap_or_default();
        let signature = classify_crash_log(&crash_text);
        let dump_count = install_root(target)
            .ok()
            .map(|root| root.join("Crashpad").join("db"))
            .and_then(|path| fs::read_dir(path).ok())
            .map(|entries| {
                entries
                    .flatten()
                    .filter(|entry| entry.path().is_file())
                    .count()
            })
            .unwrap_or(0);
        let mut actions = vec![ApexLaunchRepairAction::external("open_game_repair")];
        if signature == "graphics" {
            actions.push(ApexLaunchRepairAction::batch(
                "clear_directx_shader_cache",
                false,
                false,
                true,
            ));
        }
        if signature == "runtime" {
            actions.push(ApexLaunchRepairAction::external("open_runtime_help"));
            actions.push(ApexLaunchRepairAction::batch(
                "repair_windows_components",
                true,
                false,
                false,
            ));
        }
        ApexLaunchRepairCheckResult::new(
            "crash_logs",
            if crash_text.is_empty() && dump_count == 0 {
                ApexLaunchRepairCheckStatus::Info
            } else {
                ApexLaunchRepairCheckStatus::Warning
            },
            if crash_text.is_empty() && dump_count == 0 {
                "none"
            } else {
                signature
            },
        )
        .with_param("dumpCount", dump_count as u64)
        .with_param(
            "logPath",
            document_log
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default(),
        )
        .with_actions(actions)
    }

    fn check_configuration(target: &ApexLaunchRepairTarget) -> ApexLaunchRepairCheckResult {
        let kinds = [
            ApexConfigFileKind::VideoConfig,
            ApexConfigFileKind::Settings,
            ApexConfigFileKind::Profile,
        ];
        let mut present = 0_u64;
        let mut unreadable = Vec::new();
        let mut readonly = Vec::new();
        for kind in kinds {
            let Ok(path) = get_apex_config_path(kind) else {
                continue;
            };
            if !path.is_file() {
                continue;
            }
            present += 1;
            if ApexCfgDocument::load_from_file(&path).is_err() {
                unreadable.push(path.to_string_lossy().to_string());
            }
            if fs::metadata(&path)
                .map(|metadata| metadata.permissions().readonly())
                .unwrap_or(false)
            {
                readonly.push(path.to_string_lossy().to_string());
            }
        }
        let options = launch_options(target).unwrap_or_default();
        ApexLaunchRepairCheckResult::new(
            "configuration",
            if unreadable.is_empty() {
                if present == 0 && options.is_empty() {
                    ApexLaunchRepairCheckStatus::Info
                } else {
                    ApexLaunchRepairCheckStatus::Pass
                }
            } else {
                ApexLaunchRepairCheckStatus::Warning
            },
            if !unreadable.is_empty() {
                "unreadable"
            } else if present == 0 && options.is_empty() {
                "notGenerated"
            } else if !readonly.is_empty() {
                "readOnly"
            } else if !options.is_empty() {
                "customLaunchOptions"
            } else {
                "healthy"
            },
        )
        .with_param("fileCount", present)
        .with_param("unreadable", unreadable.join(", "))
        .with_param("readOnly", readonly.join(", "))
        .with_param("hasLaunchOptions", !options.is_empty())
        .with_actions(vec![ApexLaunchRepairAction::confirm("reset_apex_config")])
    }

    fn check_apex_cache() -> ApexLaunchRepairCheckResult {
        let Ok(local) = get_apex_local_folder_path() else {
            return ApexLaunchRepairCheckResult::new(
                "apex_cache",
                ApexLaunchRepairCheckStatus::Warning,
                "pathUnavailable",
            );
        };
        let pso = local.join("psoCache.pso");
        let Ok(saved_games) = get_apex_saved_games_root() else {
            return ApexLaunchRepairCheckResult::new(
                "apex_cache",
                ApexLaunchRepairCheckStatus::Warning,
                "pathUnavailable",
            );
        };
        let assets = saved_games.join("assets");
        let pso_bytes = file_tree_size(&pso, 1);
        let assets_bytes = file_tree_size(&assets, 8);
        let mut actions = Vec::new();
        if pso.is_file() {
            actions.push(ApexLaunchRepairAction::batch(
                "clear_apex_pso_cache",
                false,
                false,
                true,
            ));
        }
        if assets.is_dir() {
            actions.push(ApexLaunchRepairAction::batch(
                "clear_apex_assets_cache",
                false,
                false,
                false,
            ));
        }
        ApexLaunchRepairCheckResult::new(
            "apex_cache",
            if actions.is_empty() {
                ApexLaunchRepairCheckStatus::Pass
            } else {
                ApexLaunchRepairCheckStatus::Info
            },
            if actions.is_empty() {
                "empty"
            } else {
                "available"
            },
        )
        .with_param("psoBytes", pso_bytes)
        .with_param("assetsBytes", assets_bytes)
        .with_actions(actions)
    }

    fn check_shader_cache() -> ApexLaunchRepairCheckResult {
        let (directx, nvidia) = shader_cache_paths();
        let directx_bytes = directx
            .iter()
            .map(|path| file_tree_size(path, 8))
            .sum::<u64>();
        let nvidia_bytes = nvidia
            .iter()
            .map(|path| file_tree_size(path, 8))
            .sum::<u64>();
        let mut actions = Vec::new();
        if directx_bytes > 0 {
            actions.push(ApexLaunchRepairAction::batch(
                "clear_directx_shader_cache",
                false,
                false,
                false,
            ));
        }
        if nvidia_bytes > 0 {
            actions.push(ApexLaunchRepairAction::batch(
                "clear_nvidia_shader_cache",
                false,
                true,
                false,
            ));
        }
        actions.push(ApexLaunchRepairAction::external("open_gpu_vendor_help"));
        ApexLaunchRepairCheckResult::new(
            "shader_cache",
            ApexLaunchRepairCheckStatus::Info,
            if actions.is_empty() {
                "empty"
            } else {
                "available"
            },
        )
        .with_param("directxBytes", directx_bytes)
        .with_param("nvidiaBytes", nvidia_bytes)
        .with_actions(actions)
    }

    fn check_runtime() -> ApexLaunchRepairCheckResult {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let installed = ["x64", "x86"].iter().all(|architecture| {
            hklm.open_subkey(format!(
                r"SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\{architecture}"
            ))
            .ok()
            .and_then(|key| key.get_value::<u32, _>("Installed").ok())
                == Some(1)
        });
        let directx = std::env::var_os("WINDIR")
            .map(PathBuf::from)
            .map(|root| root.join("System32").join("d3dcompiler_47.dll").is_file())
            .unwrap_or(false);
        let mut actions = vec![ApexLaunchRepairAction::external("open_runtime_help")];
        if !installed || !directx {
            actions.push(ApexLaunchRepairAction::batch(
                "repair_windows_components",
                true,
                false,
                false,
            ));
        }
        ApexLaunchRepairCheckResult::new(
            "runtime",
            if installed && directx {
                ApexLaunchRepairCheckStatus::Pass
            } else {
                ApexLaunchRepairCheckStatus::Warning
            },
            if installed && directx {
                "healthy"
            } else {
                "missing"
            },
        )
        .with_param("vcRuntime", installed)
        .with_param("directx", directx)
        .with_actions(actions)
    }

    fn check_conflicts() -> ApexLaunchRepairCheckResult {
        let found = matching_processes(CONFLICT_PROCESS_NAMES);
        ApexLaunchRepairCheckResult::new(
            "conflicts",
            if found.is_empty() {
                ApexLaunchRepairCheckStatus::Pass
            } else {
                ApexLaunchRepairCheckStatus::Info
            },
            if found.is_empty() { "none" } else { "running" },
        )
        .with_param("processes", found.join(", "))
        .with_actions(if found.is_empty() {
            Vec::new()
        } else {
            vec![ApexLaunchRepairAction::batch(
                "close_conflicting_apps",
                false,
                false,
                false,
            )]
        })
    }

    pub(super) fn diagnose(
        target: &ApexLaunchRepairTarget,
        check_id: &str,
    ) -> ApexLaunchRepairCheckResult {
        match check_id {
            "installation" => check_installation(target),
            "processes" => check_processes(target),
            "game_files" => check_game_files(target),
            "anti_cheat" => check_anti_cheat(target),
            "crash_logs" => check_crash_logs(target),
            "configuration" => check_configuration(target),
            "apex_cache" => check_apex_cache(),
            "shader_cache" => check_shader_cache(),
            "runtime" => check_runtime(),
            "conflicts" => check_conflicts(),
            _ => ApexLaunchRepairCheckResult::new(
                check_id,
                ApexLaunchRepairCheckStatus::Error,
                "invalidCheck",
            ),
        }
    }

    fn clear_directory_contents(path: &Path) -> Result<(), String> {
        if !path.exists() {
            return Ok(());
        }
        if fs::symlink_metadata(path)
            .map_err(|error| error.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err("cache_root_is_symlink".to_string());
        }
        for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let child = entry.path();
            let metadata = fs::symlink_metadata(&child).map_err(|error| error.to_string())?;
            if metadata.is_dir() && !metadata.file_type().is_symlink() {
                fs::remove_dir_all(&child).map_err(|error| error.to_string())?;
            } else {
                fs::remove_file(&child).map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    }

    fn validate_cache_path(root: &Path, path: &Path) -> Result<(), String> {
        if is_safe_descendant(root, path) {
            Ok(())
        } else {
            Err("cache_path_outside_allowed_root".to_string())
        }
    }

    fn kill_processes(names: &[&str]) -> Result<Vec<String>, String> {
        let found = matching_processes(names);
        for name in &found {
            let output = Command::new("taskkill.exe")
                .with_hidden_window()
                .args(["/F", "/T", "/IM", name])
                .output()
                .map_err(|error| error.to_string())?;
            if !output.status.success() {
                let error = decode_process_output(&output.stderr);
                return Err(if error.is_empty() {
                    decode_process_output(&output.stdout)
                } else {
                    error
                });
            }
        }
        Ok(found)
    }

    fn eac_cache_path(target: &ApexLaunchRepairTarget) -> Result<PathBuf, String> {
        let root = install_root(target)?;
        let product_id =
            eac_product_id(&root).ok_or_else(|| "eac_product_id_missing".to_string())?;
        let app_data = std::env::var_os("APPDATA").ok_or_else(|| "app_data_missing".to_string())?;
        Ok(PathBuf::from(app_data)
            .join("EasyAntiCheat")
            .join(product_id))
    }

    fn perform_user_action(
        target: &ApexLaunchRepairTarget,
        action: &str,
    ) -> Result<Vec<String>, String> {
        match action {
            "close_apex" => {
                kill_processes(&["r5apex.exe", "r5apex_dx12.exe", "start_protected_game.exe"])
            }
            "close_launcher" => kill_processes(launcher_processes(target.launcher()?)),
            "close_conflicting_apps" => kill_processes(CONFLICT_PROCESS_NAMES),
            "clear_apex_pso_cache" => {
                let root = get_apex_local_folder_path()?;
                let path = root.join("psoCache.pso");
                validate_cache_path(&root, &path)?;
                if path.is_file() {
                    fs::remove_file(&path).map_err(|error| error.to_string())?;
                }
                Ok(vec![path.to_string_lossy().to_string()])
            }
            "clear_apex_assets_cache" => {
                let root = get_apex_saved_games_root()?;
                let path = root.join("assets");
                validate_cache_path(&root, &path)?;
                clear_directory_contents(&path)?;
                Ok(vec![path.to_string_lossy().to_string()])
            }
            "clear_eac_cache" => {
                let path = eac_cache_path(target)?;
                let root = std::env::var_os("APPDATA")
                    .map(PathBuf::from)
                    .ok_or_else(|| "app_data_missing".to_string())?
                    .join("EasyAntiCheat");
                validate_cache_path(&root, &path)?;
                clear_directory_contents(&path)?;
                Ok(vec![path.to_string_lossy().to_string()])
            }
            "clear_directx_shader_cache" => {
                let (paths, _) = shader_cache_paths();
                let root = std::env::var_os("LOCALAPPDATA")
                    .map(PathBuf::from)
                    .ok_or_else(|| "local_app_data_missing".to_string())?;
                for path in &paths {
                    validate_cache_path(&root, path)?;
                    clear_directory_contents(path)?;
                }
                Ok(paths
                    .into_iter()
                    .map(|path| path.to_string_lossy().to_string())
                    .collect())
            }
            "clear_nvidia_shader_cache" => {
                let (_, paths) = shader_cache_paths();
                let root = std::env::var_os("LOCALAPPDATA")
                    .map(PathBuf::from)
                    .ok_or_else(|| "local_app_data_missing".to_string())?;
                for path in &paths {
                    validate_cache_path(&root, path)?;
                    clear_directory_contents(path)?;
                }
                Ok(paths
                    .into_iter()
                    .map(|path| path.to_string_lossy().to_string())
                    .collect())
            }
            _ => Err("unsupported_user_action".to_string()),
        }
    }

    fn quote_command_path(path: &Path) -> String {
        format!("\"{}\"", path.to_string_lossy().replace('"', ""))
    }

    pub(super) fn driver_removal_command(driver: &Path, backup: &Path) -> String {
        format!(
            "copy /Y {} {} >NUL && (del /F /Q {} || (copy /Y {} {} >NUL & exit /B 1))",
            quote_command_path(driver),
            quote_command_path(backup),
            quote_command_path(driver),
            quote_command_path(backup),
            quote_command_path(driver),
        )
    }

    fn admin_commands(
        target: &ApexLaunchRepairTarget,
        action: &str,
    ) -> Result<(Vec<String>, Vec<String>), String> {
        match action {
            "repair_eac" => {
                let root = install_root(target)?;
                let setup = find_eac_setup(&root).ok_or_else(|| "eac_setup_missing".to_string())?;
                let product_id =
                    eac_product_id(&root).ok_or_else(|| "eac_product_id_missing".to_string())?;
                Ok((
                    vec![format!(
                        "{} repair {}",
                        quote_command_path(&setup),
                        product_id
                    )],
                    vec![setup.to_string_lossy().to_string()],
                ))
            }
            "remove_stale_eac_driver" => {
                let drivers = eac_driver_paths();
                if drivers.is_empty() {
                    return Ok((Vec::new(), Vec::new()));
                }
                let local = std::env::var_os("LOCALAPPDATA")
                    .ok_or_else(|| "local_app_data_missing".to_string())?;
                let backup_dir = PathBuf::from(local)
                    .join("mxtools")
                    .join("apex-launch-repair")
                    .join("driver-backups");
                fs::create_dir_all(&backup_dir).map_err(|error| error.to_string())?;
                let stamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                let mut commands = Vec::new();
                let mut changed = Vec::new();
                for driver in drivers {
                    let file_name = driver
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("EasyAntiCheat.sys");
                    let backup = backup_dir.join(format!("{stamp}-{file_name}"));
                    commands.push(driver_removal_command(&driver, &backup));
                    changed.push(driver.to_string_lossy().to_string());
                    changed.push(backup.to_string_lossy().to_string());
                }
                Ok((commands, changed))
            }
            "repair_windows_components" => Ok((
                vec![
                    "DISM.exe /Online /Cleanup-Image /RestoreHealth".to_string(),
                    "sfc.exe /scannow".to_string(),
                ],
                vec!["Windows component store".to_string()],
            )),
            _ => Err("unsupported_admin_action".to_string()),
        }
    }

    pub(super) fn repair(
        target: ApexLaunchRepairTarget,
        actions: Vec<String>,
    ) -> Vec<ApexLaunchRepairActionResult> {
        let admin_ids = [
            "remove_stale_eac_driver",
            "repair_eac",
            "repair_windows_components",
        ];
        let mut results = Vec::new();
        let mut admin_commands_all = Vec::new();
        let mut admin_changed = HashMap::<String, Vec<String>>::new();
        let mut runnable_admin = Vec::new();

        for action in &actions {
            if admin_ids.contains(&action.as_str()) {
                match admin_commands(&target, action) {
                    Ok((commands, changed)) => {
                        admin_commands_all.extend(commands);
                        admin_changed.insert(action.clone(), changed);
                        runnable_admin.push(action.clone());
                    }
                    Err(error) => {
                        results.push(ApexLaunchRepairActionResult::failure(action, error))
                    }
                }
                continue;
            }
            match perform_user_action(&target, action) {
                Ok(changed) => results.push(ApexLaunchRepairActionResult::success(
                    action,
                    action == "clear_nvidia_shader_cache",
                    changed,
                )),
                Err(error) => results.push(ApexLaunchRepairActionResult::failure(action, error)),
            }
        }

        let admin_result = if admin_commands_all.is_empty() {
            Ok(())
        } else {
            run_multiple_commands(
                &admin_commands_all,
                RunCommandOptions::new(true, !is_elevated(), false),
            )
            .map(|_| ())
        };
        for action in runnable_admin {
            match &admin_result {
                Ok(()) => results.push(ApexLaunchRepairActionResult::success(
                    &action,
                    action == "remove_stale_eac_driver",
                    admin_changed.remove(&action).unwrap_or_default(),
                )),
                Err(error) => results.push(ApexLaunchRepairActionResult::failure(
                    &action,
                    error.clone(),
                )),
            }
        }
        results.sort_by_key(|result| {
            ACTION_ORDER
                .iter()
                .position(|action| *action == result.action)
                .unwrap_or(usize::MAX)
        });
        results
    }
}

fn parse_eac_product_id(text: &str) -> Option<String> {
    let value = serde_json::from_str::<serde_json::Value>(text).ok()?;
    value
        .as_object()?
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case("productid"))
        .and_then(|(_, value)| value.as_str())
        .map(str::trim)
        .filter(|value| {
            !value.is_empty()
                && value
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '-')
        })
        .map(str::to_string)
}

fn classify_eac_log(text: &str) -> &'static str {
    let lower = text.to_ascii_lowercase();
    if lower.contains("30005") || lower.contains("createservice failed") {
        "error30005"
    } else if lower.contains("integrity") || lower.contains("0x80000001") {
        "integrity"
    } else if lower.contains("failed to launch")
        || lower.contains("launcher finished with") && !lower.contains("successfully loaded")
    {
        "launchFailed"
    } else {
        "healthy"
    }
}

fn classify_crash_log(text: &str) -> &'static str {
    let lower = text.to_ascii_lowercase();
    if text.is_empty() {
        "none"
    } else if lower.contains("dxgi_error")
        || lower.contains("device_hung")
        || lower.contains("d3d12")
        || lower.contains("shader")
    {
        "graphics"
    } else if lower.contains("vcruntime")
        || lower.contains("msvcp")
        || lower.contains("d3dcompiler")
        || lower.contains("dll was not found")
    {
        "runtime"
    } else if lower.contains("easyanticheat") || lower.contains("anti-cheat") {
        "antiCheat"
    } else {
        "detected"
    }
}

#[cfg(windows)]
fn diagnose_inner(
    target: &ApexLaunchRepairTarget,
    check_id: &str,
) -> IpcResult<ApexLaunchRepairCheckResult> {
    Ok(windows_impl::diagnose(target, check_id))
}

#[cfg(not(windows))]
fn diagnose_inner(
    _target: &ApexLaunchRepairTarget,
    check_id: &str,
) -> IpcResult<ApexLaunchRepairCheckResult> {
    Ok(ApexLaunchRepairCheckResult::new(
        check_id,
        ApexLaunchRepairCheckStatus::Error,
        "windowsOnly",
    ))
}

#[cfg(windows)]
fn repair_inner(
    target: ApexLaunchRepairTarget,
    actions: Vec<String>,
) -> IpcResult<Vec<ApexLaunchRepairActionResult>> {
    let _guard = APEX_LAUNCH_REPAIR_LOCK.try_lock().map_err(|_| {
        repair_error(
            "repair_in_progress",
            "An Apex launch repair is already in progress",
        )
    })?;
    Ok(windows_impl::repair(target, actions))
}

#[cfg(not(windows))]
fn repair_inner(
    _target: ApexLaunchRepairTarget,
    actions: Vec<String>,
) -> IpcResult<Vec<ApexLaunchRepairActionResult>> {
    Ok(actions
        .into_iter()
        .map(|action| ApexLaunchRepairActionResult::failure(&action, "windowsOnly"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_targets_and_accounts() {
        let steam = ApexLaunchRepairTarget {
            launcher: "steam".to_string(),
            account_id: "12345".to_string(),
        };
        assert_eq!(steam.launcher().unwrap(), Launcher::Steam);
        let invalid = ApexLaunchRepairTarget {
            launcher: "epic".to_string(),
            account_id: "12345".to_string(),
        };
        assert!(invalid.launcher().is_err());
    }

    #[test]
    fn orders_and_deduplicates_allowlisted_actions() {
        let actions = normalized_actions(vec![
            "repair_eac".to_string(),
            "close_apex".to_string(),
            "repair_eac".to_string(),
        ])
        .unwrap();
        assert_eq!(actions, vec!["close_apex", "repair_eac"]);
        assert!(normalized_actions(vec!["delete_everything".to_string()]).is_err());
    }

    #[test]
    fn parses_product_id_without_hard_coding_a_game_number() {
        assert_eq!(
            parse_eac_product_id(r#"{"productid":"abc-123","sandboxid":"ignored"}"#),
            Some("abc-123".to_string())
        );
        assert_eq!(parse_eac_product_id(r#"{"productid":"../escape"}"#), None);
    }

    #[test]
    fn classifies_high_signal_log_signatures() {
        assert_eq!(
            classify_eac_log("Error 30005 CreateService failed"),
            "error30005"
        );
        assert_eq!(
            classify_eac_log("runtime integrity check failed"),
            "integrity"
        );
        assert_eq!(classify_crash_log("DXGI_ERROR_DEVICE_HUNG"), "graphics");
        assert_eq!(
            classify_crash_log("VCRUNTIME140.dll was not found"),
            "runtime"
        );
    }

    #[test]
    fn parses_steam_and_ea_install_roots() {
        assert_eq!(
            steam_install_root(Path::new(r"D:\SteamLibrary")),
            PathBuf::from(r"D:\SteamLibrary\steamapps\common\Apex Legends")
        );
        assert_eq!(
            parse_ea_install_root("user.locale=en_US\nuser.downloadinplacedir=\"D:\\EA Games\"\n"),
            Some(PathBuf::from(r"D:\EA Games\Apex"))
        );
        assert_eq!(parse_ea_install_root("user.locale=en_US"), None);
    }

    #[test]
    fn rejects_cache_paths_that_escape_the_allowlisted_root() {
        let root = Path::new(r"C:\Users\fixture\AppData\Local");
        assert!(is_safe_descendant(root, &root.join("D3DSCache")));
        assert!(!is_safe_descendant(
            root,
            &root.join("..").join("Documents")
        ));
        assert!(!is_safe_descendant(root, Path::new(r"C:\Windows\Temp")));
    }

    #[cfg(windows)]
    #[test]
    fn repair_mutex_rejects_a_concurrent_batch() {
        let _guard = APEX_LAUNCH_REPAIR_LOCK.lock().unwrap();
        let result = repair_inner(
            ApexLaunchRepairTarget {
                launcher: "steam".to_string(),
                account_id: "12345".to_string(),
            },
            vec!["close_apex".to_string()],
        );
        assert!(result.is_err());
    }

    #[cfg(windows)]
    #[test]
    fn stale_driver_command_backs_up_before_delete_and_restores_on_failure() {
        let command = windows_impl::driver_removal_command(
            Path::new(r"C:\Fixture\EasyAntiCheat.sys"),
            Path::new(r"C:\Backup\EasyAntiCheat.sys"),
        );
        let first_copy = command.find("copy /Y").unwrap();
        let delete = command.find("del /F /Q").unwrap();
        let rollback_copy = command.rfind("copy /Y").unwrap();
        assert!(first_copy < delete && delete < rollback_copy);
        assert!(command.ends_with("exit /B 1))"));
    }
}
