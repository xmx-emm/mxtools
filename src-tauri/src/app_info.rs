use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AppDistribution {
    Development,
    Portable,
    Installer,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub distribution: AppDistribution,
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        distribution: detect_distribution(),
    }
}

fn detect_distribution() -> AppDistribution {
    if cfg!(debug_assertions) {
        return AppDistribution::Development;
    }

    if is_portable_exe_name() {
        return AppDistribution::Portable;
    }

    if is_installed_app() {
        return AppDistribution::Installer;
    }

    AppDistribution::Portable
}

fn exe_stem() -> Option<String> {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.file_stem().map(|name| name.to_string_lossy().into_owned()))
}

fn is_portable_exe_name() -> bool {
    exe_stem()
        .map(|name| name.contains("便携版"))
        .unwrap_or(false)
}

#[cfg(windows)]
fn has_nsis_uninstaller_sibling() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|dir| dir.join("uninstall.exe").is_file()))
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn has_nsis_uninstaller_sibling() -> bool {
    false
}

fn normalize_registry_path(value: &str) -> String {
    let unquoted = value.trim().trim_matches('"').trim();
    unquoted.trim_end_matches(['\\', '/']).to_string()
}

#[cfg(windows)]
fn is_installed_app() -> bool {
    use std::path::{Path, PathBuf};
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    if has_nsis_uninstaller_sibling() {
        return true;
    }

    let exe_path = match std::env::current_exe() {
        Ok(path) => path,
        Err(_) => return false,
    };
    let exe_dir = match exe_path.parent() {
        Some(dir) => dir,
        None => return false,
    };

    fn paths_match(left: &Path, right: &Path) -> bool {
        left == right
            || left
                .canonicalize()
                .ok()
                .zip(right.canonicalize().ok())
                .is_some_and(|(a, b)| a == b)
    }

    fn install_location_matches(install_location: &str, exe_dir: &Path, exe_path: &Path) -> bool {
        let install_path = PathBuf::from(normalize_registry_path(install_location));
        if install_path.as_os_str().is_empty() {
            return false;
        }
        paths_match(exe_dir, install_path.as_path()) || exe_path.starts_with(&install_path)
    }

    fn uninstall_key_matches(subkey: &RegKey, exe_dir: &Path, exe_path: &Path) -> bool {
        let install_location = subkey
            .get_value::<String, _>("InstallLocation")
            .unwrap_or_default();
        if install_location_matches(&install_location, exe_dir, exe_path) {
            return true;
        }

        let display_icon = subkey
            .get_value::<String, _>("DisplayIcon")
            .unwrap_or_default();
        let display_icon_path = PathBuf::from(normalize_registry_path(&display_icon));
        if paths_match(&display_icon_path, exe_path) {
            let display_name = subkey
                .get_value::<String, _>("DisplayName")
                .unwrap_or_default()
                .to_lowercase();
            return display_name.contains("mxtools") || display_name.contains("萌新");
        }

        false
    }

    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let root = RegKey::predef(hive);
        let Ok(uninstall) = root.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall")
        else {
            continue;
        };

        for key_name in uninstall.enum_keys().filter_map(Result::ok) {
            let Ok(subkey) = uninstall.open_subkey(&key_name) else {
                continue;
            };
            if uninstall_key_matches(&subkey, exe_dir, &exe_path) {
                return true;
            }
        }
    }

    false
}

#[cfg(not(windows))]
fn is_installed_app() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::normalize_registry_path;

    #[test]
    fn normalize_registry_path_strips_quotes_and_trailing_slashes() {
        assert_eq!(
            normalize_registry_path("\"C:\\Users\\demo\\AppData\\Local\\mxtools\\\""),
            "C:\\Users\\demo\\AppData\\Local\\mxtools"
        );
        assert_eq!(
            normalize_registry_path("C:\\Program Files\\mxtools"),
            "C:\\Program Files\\mxtools"
        );
    }
}
