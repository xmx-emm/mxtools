use crate::ipc_error::{IpcError, IpcResult};
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

const MAX_MANIFEST_BYTES: usize = 2 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES: usize = 4096;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GameSource {
    Steam,
    Epic,
    Xbox,
    Ea,
    Ubisoft,
    BattleNet,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GameScanSourceStatus {
    Completed,
    NotInstalled,
    Partial,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameScanSourceError {
    pub stage: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSourceScanResult {
    pub source: GameSource,
    pub status: GameScanSourceStatus,
    pub game_count: usize,
    pub errors: Vec<GameScanSourceError>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstalledGameMatcherKind {
    ExecutablePath,
    PackageFamilyName,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGameMatcher {
    pub kind: InstalledGameMatcherKind,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGameInstallation {
    pub source: GameSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_game_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_location: Option<String>,
    pub matchers: Vec<InstalledGameMatcher>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGame {
    pub logical_id: String,
    pub name: String,
    pub is_shooter: bool,
    pub sources: Vec<GameSource>,
    pub installations: Vec<InstalledGameInstallation>,
    pub matchers: Vec<InstalledGameMatcher>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGameScanReport {
    pub games: Vec<InstalledGame>,
    pub sources: Vec<GameSourceScanResult>,
}

#[derive(Debug, Clone)]
struct CandidateGame {
    source: GameSource,
    source_game_id: Option<String>,
    name: String,
    install_location: Option<PathBuf>,
    matchers: Vec<InstalledGameMatcher>,
}

#[derive(Debug, Default)]
struct SourceOutcome {
    candidates: Vec<CandidateGame>,
    errors: Vec<GameScanSourceError>,
    source_present: bool,
}

impl SourceOutcome {
    fn error(&mut self, stage: impl Into<String>, message: impl Into<String>) {
        self.errors.push(GameScanSourceError {
            stage: stage.into(),
            message: message.into(),
        });
    }

    fn report(&self, source: GameSource) -> GameSourceScanResult {
        let status = match (
            self.errors.is_empty(),
            self.source_present || !self.candidates.is_empty(),
        ) {
            (true, true) => GameScanSourceStatus::Completed,
            (true, false) => GameScanSourceStatus::NotInstalled,
            (false, true) => GameScanSourceStatus::Partial,
            (false, false) => GameScanSourceStatus::Failed,
        };
        GameSourceScanResult {
            source,
            status,
            game_count: self.candidates.len(),
            errors: self.errors.clone(),
        }
    }
}

trait FileAccess: Send + Sync {
    fn read_text_limited(&self, path: &Path, max_bytes: usize) -> Result<Option<String>, String>;
    fn list_dir(&self, path: &Path, max_entries: usize) -> Result<Option<Vec<PathBuf>>, String>;
    fn is_file(&self, path: &Path) -> bool;
    fn is_dir(&self, path: &Path) -> bool;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum RegistryHive {
    CurrentUser,
    LocalMachine,
}

trait RegistryAccess: Send + Sync {
    fn string_value(
        &self,
        hive: RegistryHive,
        key: &str,
        value: &str,
    ) -> Result<Option<String>, String>;
    fn subkeys(&self, hive: RegistryHive, key: &str) -> Result<Option<Vec<String>>, String>;
}

#[derive(Debug, Clone)]
struct ScanRoots {
    program_data: PathBuf,
    program_files_x86: PathBuf,
    system_drive: PathBuf,
}

impl ScanRoots {
    fn system() -> Self {
        let system_drive = std::env::var_os("SystemDrive")
            .map(|drive| {
                PathBuf::from(format!(
                    "{}\\",
                    drive.to_string_lossy().trim_end_matches(['\\', '/'])
                ))
            })
            .unwrap_or_else(|| PathBuf::from("C:\\"));
        Self {
            program_data: std::env::var_os("ProgramData")
                .map(PathBuf::from)
                .unwrap_or_else(|| system_drive.join("ProgramData")),
            program_files_x86: std::env::var_os("ProgramFiles(x86)")
                .map(PathBuf::from)
                .unwrap_or_else(|| system_drive.join("Program Files (x86)")),
            system_drive,
        }
    }
}

struct ScanContext<'a> {
    files: &'a dyn FileAccess,
    registry: &'a dyn RegistryAccess,
    roots: &'a ScanRoots,
}

struct RealFileAccess;

impl FileAccess for RealFileAccess {
    fn read_text_limited(&self, path: &Path, max_bytes: usize) -> Result<Option<String>, String> {
        let metadata = match std::fs::metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("{}: {error}", path.display())),
        };
        if !metadata.is_file() {
            return Ok(None);
        }
        if metadata.len() > max_bytes as u64 {
            return Err(format!(
                "{} exceeds the {} byte manifest limit",
                path.display(),
                max_bytes
            ));
        }
        std::fs::read_to_string(path)
            .map(Some)
            .map_err(|error| format!("{}: {error}", path.display()))
    }

    fn list_dir(&self, path: &Path, max_entries: usize) -> Result<Option<Vec<PathBuf>>, String> {
        let reader = match std::fs::read_dir(path) {
            Ok(reader) => reader,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("{}: {error}", path.display())),
        };
        let mut entries = Vec::new();
        for entry in reader {
            let entry = entry.map_err(|error| format!("{}: {error}", path.display()))?;
            if entries.len() == max_entries {
                return Err(format!(
                    "{} exceeds the {} entry scan limit",
                    path.display(),
                    max_entries
                ));
            }
            entries.push(entry.path());
        }
        entries.sort_by_key(|path| path_key(path));
        Ok(Some(entries))
    }

    fn is_file(&self, path: &Path) -> bool {
        path.is_file()
    }

    fn is_dir(&self, path: &Path) -> bool {
        path.is_dir()
    }
}

struct RealRegistryAccess;

#[cfg(windows)]
impl RealRegistryAccess {
    fn root(hive: RegistryHive) -> winreg::RegKey {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        match hive {
            RegistryHive::CurrentUser => winreg::RegKey::predef(HKEY_CURRENT_USER),
            RegistryHive::LocalMachine => winreg::RegKey::predef(HKEY_LOCAL_MACHINE),
        }
    }
}

#[cfg(windows)]
impl RegistryAccess for RealRegistryAccess {
    fn string_value(
        &self,
        hive: RegistryHive,
        key: &str,
        value: &str,
    ) -> Result<Option<String>, String> {
        let key = match Self::root(hive).open_subkey(key) {
            Ok(key) => key,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("{key}: {error}")),
        };
        match key.get_value::<String, _>(value) {
            Ok(value) => Ok(Some(expand_environment_variables(&value))),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
            Err(error) if error.kind() == ErrorKind::InvalidData => Ok(None),
            Err(error) => Err(format!("{value}: {error}")),
        }
    }

    fn subkeys(&self, hive: RegistryHive, key: &str) -> Result<Option<Vec<String>>, String> {
        let key_handle = match Self::root(hive).open_subkey(key) {
            Ok(key) => key,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("{key}: {error}")),
        };
        let mut names = Vec::new();
        for name in key_handle.enum_keys() {
            if names.len() == MAX_DIRECTORY_ENTRIES {
                return Err(format!(
                    "{key} exceeds the {MAX_DIRECTORY_ENTRIES} subkey scan limit"
                ));
            }
            names.push(name.map_err(|error| format!("{key}: {error}"))?);
        }
        names.sort_by_key(|name| name.to_ascii_lowercase());
        Ok(Some(names))
    }
}

#[cfg(not(windows))]
impl RegistryAccess for RealRegistryAccess {
    fn string_value(
        &self,
        _hive: RegistryHive,
        _key: &str,
        _value: &str,
    ) -> Result<Option<String>, String> {
        Ok(None)
    }

    fn subkeys(&self, _hive: RegistryHive, _key: &str) -> Result<Option<Vec<String>>, String> {
        Ok(None)
    }
}

/// Scans only launcher registries and their documented, bounded manifest directories.
#[tauri::command]
pub async fn scan_installed_games() -> IpcResult<InstalledGameScanReport> {
    tokio::task::spawn_blocking(|| {
        let files = RealFileAccess;
        let registry = RealRegistryAccess;
        let roots = ScanRoots::system();
        Ok(scan_with(&ScanContext {
            files: &files,
            registry: &registry,
            roots: &roots,
        }))
    })
    .await
    .map_err(|error| IpcError::operation_failed("game_scan", error.to_string()))?
}

fn scan_with(context: &ScanContext<'_>) -> InstalledGameScanReport {
    let outcomes = [
        (GameSource::Steam, scan_steam(context)),
        (GameSource::Epic, scan_epic(context)),
        (GameSource::Xbox, scan_xbox(context)),
        (GameSource::Ea, scan_vendor(context, GameSource::Ea)),
        (
            GameSource::Ubisoft,
            scan_vendor(context, GameSource::Ubisoft),
        ),
        (
            GameSource::BattleNet,
            scan_vendor(context, GameSource::BattleNet),
        ),
    ];
    let sources = outcomes
        .iter()
        .map(|(source, outcome)| outcome.report(*source))
        .collect();
    let candidates = outcomes
        .into_iter()
        .flat_map(|(_, outcome)| outcome.candidates)
        .collect();
    InstalledGameScanReport {
        games: merge_candidates(candidates),
        sources,
    }
}

fn scan_steam(context: &ScanContext<'_>) -> SourceOutcome {
    let mut outcome = SourceOutcome::default();
    let mut steam_roots = Vec::new();
    for (hive, key, value) in [
        (
            RegistryHive::CurrentUser,
            r"Software\Valve\Steam",
            "SteamPath",
        ),
        (
            RegistryHive::LocalMachine,
            r"SOFTWARE\Valve\Steam",
            "InstallPath",
        ),
        (
            RegistryHive::LocalMachine,
            r"SOFTWARE\WOW6432Node\Valve\Steam",
            "InstallPath",
        ),
    ] {
        match context.registry.string_value(hive, key, value) {
            Ok(Some(path)) => push_unique_path(&mut steam_roots, PathBuf::from(path)),
            Ok(None) => {}
            Err(error) => outcome.error("registry", error),
        }
    }
    let conventional = context.roots.program_files_x86.join("Steam");
    if context.files.is_dir(&conventional) {
        push_unique_path(&mut steam_roots, conventional);
    }

    for steam_root in steam_roots {
        let library_manifest = steam_root.join("steamapps").join("libraryfolders.vdf");
        let Some(text) = read_manifest(context, &library_manifest, &mut outcome) else {
            continue;
        };
        outcome.source_present = true;
        let parsed = match windows_tool::vdf::parse_vdf_string(&text) {
            Ok(parsed) => parsed,
            Err(error) => {
                outcome.error(
                    "libraryfolders",
                    format!("{}: {error}", library_manifest.display()),
                );
                continue;
            }
        };
        let mut libraries = vec![steam_root.clone()];
        if let Some(folders) = parsed
            .get_by_path(&["libraryfolders"])
            .and_then(|value| value.as_object())
        {
            for entry in folders.values() {
                let path = entry
                    .as_string()
                    .or_else(|| entry.get_value("path"))
                    .map(PathBuf::from);
                if let Some(path) = path {
                    push_unique_path(&mut libraries, path);
                }
            }
        } else {
            outcome.error(
                "libraryfolders",
                format!(
                    "{} is missing the libraryfolders object",
                    library_manifest.display()
                ),
            );
        }

        for library in libraries {
            scan_steam_library(context, &library, &mut outcome);
        }
    }
    deduplicate_candidates(&mut outcome.candidates);
    outcome
}

fn scan_steam_library(context: &ScanContext<'_>, library: &Path, outcome: &mut SourceOutcome) {
    let steamapps = library.join("steamapps");
    let entries = match context.files.list_dir(&steamapps, MAX_DIRECTORY_ENTRIES) {
        Ok(Some(entries)) => entries,
        Ok(None) => return,
        Err(error) => {
            outcome.error("appmanifest-list", error);
            return;
        }
    };
    for manifest in entries.into_iter().filter(|path| {
        path.file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("appmanifest_") && name.ends_with(".acf"))
    }) {
        let Some(text) = read_manifest(context, &manifest, outcome) else {
            continue;
        };
        let parsed = match windows_tool::vdf::parse_vdf_string(&text) {
            Ok(parsed) => parsed,
            Err(error) => {
                outcome.error("appmanifest", format!("{}: {error}", manifest.display()));
                continue;
            }
        };
        let Some(app_state) = parsed.get("AppState") else {
            outcome.error(
                "appmanifest",
                format!("{} is missing AppState", manifest.display()),
            );
            continue;
        };
        let app_id = app_state
            .get_value("appid")
            .map(str::to_string)
            .or_else(|| steam_app_id_from_path(&manifest));
        let name = app_state.get_value("name").unwrap_or("").trim();
        let install_dir = app_state.get_value("installdir").unwrap_or("").trim();
        if name.is_empty() || install_dir.is_empty() {
            outcome.error(
                "appmanifest",
                format!("{} is missing name or installdir", manifest.display()),
            );
            continue;
        }
        let install_location = steamapps.join("common").join(install_dir);
        if !context.files.is_dir(&install_location) {
            continue;
        }
        let matchers = executable_matchers(
            context.files,
            &install_location,
            None,
            catalog_for(GameSource::Steam, app_id.as_deref(), name),
        );
        outcome.candidates.push(CandidateGame {
            source: GameSource::Steam,
            source_game_id: app_id,
            name: name.to_string(),
            install_location: Some(install_location),
            matchers,
        });
    }
}

fn scan_epic(context: &ScanContext<'_>) -> SourceOutcome {
    let mut outcome = SourceOutcome::default();
    let manifest_dir = context
        .roots
        .program_data
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests");
    let entries = match context.files.list_dir(&manifest_dir, MAX_DIRECTORY_ENTRIES) {
        Ok(Some(entries)) => {
            outcome.source_present = true;
            entries
        }
        Ok(None) => return outcome,
        Err(error) => {
            outcome.error("manifest-list", error);
            return outcome;
        }
    };
    for manifest in entries.into_iter().filter(|path| {
        path.extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("item"))
    }) {
        let Some(text) = read_manifest(context, &manifest, &mut outcome) else {
            continue;
        };
        let value: Value = match serde_json::from_str(&text) {
            Ok(value) => value,
            Err(error) => {
                outcome.error("manifest", format!("{}: {error}", manifest.display()));
                continue;
            }
        };
        if value
            .get("bIsIncompleteInstall")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }
        let name = json_string(&value, &["DisplayName", "AppName"]).unwrap_or_default();
        let install = json_string(&value, &["InstallLocation"]).map(PathBuf::from);
        if name.trim().is_empty()
            || install
                .as_ref()
                .is_none_or(|path| !context.files.is_dir(path))
        {
            continue;
        }
        let source_game_id = json_string(&value, &["CatalogItemId", "MainGameAppName", "AppName"]);
        let declared = json_string(&value, &["LaunchExecutable"]);
        let install = install.expect("install location checked above");
        let matchers = executable_matchers(
            context.files,
            &install,
            declared.as_deref(),
            catalog_for(GameSource::Epic, source_game_id.as_deref(), &name),
        );
        outcome.candidates.push(CandidateGame {
            source: GameSource::Epic,
            source_game_id,
            name,
            install_location: Some(install),
            matchers,
        });
    }
    outcome
}

fn scan_xbox(context: &ScanContext<'_>) -> SourceOutcome {
    let mut outcome = SourceOutcome::default();
    let mut roots = vec![context.roots.system_drive.join("XboxGames")];
    for (hive, key, value) in [
        (
            RegistryHive::LocalMachine,
            r"SOFTWARE\Microsoft\GamingServices",
            "GamingInstallPath",
        ),
        (
            RegistryHive::LocalMachine,
            r"SOFTWARE\Microsoft\GamingServices",
            "DefaultInstallPath",
        ),
        (
            RegistryHive::CurrentUser,
            r"SOFTWARE\Microsoft\GamingServices",
            "GamingInstallPath",
        ),
    ] {
        match context.registry.string_value(hive, key, value) {
            Ok(Some(path)) => {
                push_unique_path(&mut roots, normalize_xbox_root(PathBuf::from(path)))
            }
            Ok(None) => {}
            Err(error) => outcome.error("registry", error),
        }
    }
    for root in roots {
        let entries = match context.files.list_dir(&root, MAX_DIRECTORY_ENTRIES) {
            Ok(Some(entries)) => {
                outcome.source_present = true;
                entries
            }
            Ok(None) => continue,
            Err(error) => {
                outcome.error("library-list", error);
                continue;
            }
        };
        for game_dir in entries
            .into_iter()
            .filter(|path| context.files.is_dir(path))
        {
            let content_dir = game_dir.join("Content");
            let manifest = content_dir.join("MicrosoftGame.config");
            let Some(xml) = read_manifest(context, &manifest, &mut outcome) else {
                continue;
            };
            let parsed = match parse_microsoft_game_config(&xml) {
                Ok(parsed) => parsed,
                Err(error) => {
                    outcome.error(
                        "microsoft-game-config",
                        format!("{}: {error}", manifest.display()),
                    );
                    continue;
                }
            };
            let fallback_name = game_dir
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Xbox game")
                .to_string();
            let name = parsed
                .display_name
                .filter(|name| !name.starts_with("ms-resource:"))
                .unwrap_or(fallback_name);
            let mut matchers = parsed
                .executables
                .into_iter()
                .map(|executable| content_dir.join(executable))
                .filter(|path| context.files.is_file(path))
                .map(executable_matcher)
                .collect::<Vec<_>>();
            if let Some(package_family_name) = parsed.package_family_name {
                matchers.push(InstalledGameMatcher {
                    kind: InstalledGameMatcherKind::PackageFamilyName,
                    value: package_family_name,
                });
            }
            sort_deduplicate_matchers(&mut matchers);
            outcome.candidates.push(CandidateGame {
                source: GameSource::Xbox,
                source_game_id: parsed.store_id.or(parsed.identity_name),
                name,
                install_location: Some(content_dir),
                matchers,
            });
        }
    }
    deduplicate_candidates(&mut outcome.candidates);
    outcome
}

fn scan_vendor(context: &ScanContext<'_>, source: GameSource) -> SourceOutcome {
    let mut outcome = SourceOutcome::default();
    for (hive, root) in uninstall_registry_roots() {
        let subkeys = match context.registry.subkeys(hive, root) {
            Ok(Some(subkeys)) => subkeys,
            Ok(None) => continue,
            Err(error) => {
                outcome.error("uninstall-registry", error);
                continue;
            }
        };
        for subkey in subkeys {
            let key = format!(r"{root}\{subkey}");
            let name = registry_value(context, &mut outcome, hive, &key, "DisplayName");
            let publisher = registry_value(context, &mut outcome, hive, &key, "Publisher");
            let uninstall = registry_value(context, &mut outcome, hive, &key, "UninstallString");
            let install = registry_value(context, &mut outcome, hive, &key, "InstallLocation");
            let display_icon = registry_value(context, &mut outcome, hive, &key, "DisplayIcon");
            let Some(name) = name else {
                continue;
            };
            if !vendor_uninstall_matches(
                source,
                &subkey,
                &name,
                publisher.as_deref(),
                uninstall.as_deref(),
                install.as_deref(),
            ) || is_launcher_entry(source, &name)
            {
                continue;
            }
            outcome.source_present = true;
            let install_location = install
                .as_deref()
                .map(clean_registry_path)
                .filter(|path| context.files.is_dir(path));
            let mut matchers = Vec::new();
            if let Some(icon) = display_icon.as_deref().and_then(display_icon_path) {
                let icon = make_absolute(&icon, install_location.as_deref());
                if icon
                    .as_ref()
                    .is_some_and(|path| context.files.is_file(path))
                {
                    matchers.push(executable_matcher(icon.expect("icon path checked above")));
                }
            }
            if let Some(install_location) = &install_location {
                matchers.extend(executable_matchers(
                    context.files,
                    install_location,
                    None,
                    catalog_for(source, Some(&subkey), &name),
                ));
            }
            sort_deduplicate_matchers(&mut matchers);
            outcome.candidates.push(CandidateGame {
                source,
                source_game_id: Some(subkey),
                name,
                install_location,
                matchers,
            });
        }
    }
    scan_vendor_registry(context, source, &mut outcome);
    scan_vendor_manifests(context, source, &mut outcome);
    deduplicate_candidates(&mut outcome.candidates);
    outcome
}

fn scan_vendor_registry(
    context: &ScanContext<'_>,
    source: GameSource,
    outcome: &mut SourceOutcome,
) {
    let roots: &[(RegistryHive, &str)] = match source {
        GameSource::Ea => &[
            (RegistryHive::LocalMachine, r"SOFTWARE\EA Games"),
            (RegistryHive::LocalMachine, r"SOFTWARE\WOW6432Node\EA Games"),
        ],
        GameSource::Ubisoft => &[
            (
                RegistryHive::LocalMachine,
                r"SOFTWARE\Ubisoft\Launcher\Installs",
            ),
            (
                RegistryHive::LocalMachine,
                r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs",
            ),
        ],
        GameSource::BattleNet => &[
            (
                RegistryHive::LocalMachine,
                r"SOFTWARE\Blizzard Entertainment",
            ),
            (
                RegistryHive::LocalMachine,
                r"SOFTWARE\WOW6432Node\Blizzard Entertainment",
            ),
        ],
        _ => return,
    };
    for &(hive, root) in roots {
        let subkeys = match context.registry.subkeys(hive, root) {
            Ok(Some(subkeys)) => subkeys,
            Ok(None) => continue,
            Err(error) => {
                outcome.error("vendor-registry", error);
                continue;
            }
        };
        for subkey in subkeys {
            let key = format!(r"{root}\{subkey}");
            let name = registry_value(context, outcome, hive, &key, "DisplayName")
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| subkey.clone());
            if is_launcher_entry(source, &name)
                || (source == GameSource::Ubisoft && name.chars().all(|ch| ch.is_ascii_digit()))
            {
                continue;
            }
            let install = [
                "Install Dir",
                "InstallDir",
                "InstallPath",
                "InstallLocation",
            ]
            .into_iter()
            .find_map(|value| registry_value(context, outcome, hive, &key, value))
            .map(|path| clean_registry_path(&path))
            .filter(|path| context.files.is_dir(path));
            if install.is_none() {
                continue;
            }
            outcome.source_present = true;
            let install_ref = install.as_deref().expect("install path checked above");
            let matchers = executable_matchers(
                context.files,
                install_ref,
                None,
                catalog_for(source, Some(&subkey), &name),
            );
            outcome.candidates.push(CandidateGame {
                source,
                source_game_id: Some(subkey),
                name,
                install_location: install,
                matchers,
            });
        }
    }
}

fn scan_vendor_manifests(
    context: &ScanContext<'_>,
    source: GameSource,
    outcome: &mut SourceOutcome,
) {
    let directories = match source {
        GameSource::Ea => vec![context
            .roots
            .program_data
            .join("EA Desktop")
            .join("InstallData")],
        GameSource::Ubisoft => vec![context
            .roots
            .program_files_x86
            .join("Ubisoft")
            .join("Ubisoft Game Launcher")
            .join("cache")
            .join("configuration")
            .join("configurations")],
        GameSource::BattleNet => vec![context
            .roots
            .program_data
            .join("Battle.net")
            .join("Agent")
            .join("data")],
        _ => Vec::new(),
    };
    for directory in directories {
        let entries = match context.files.list_dir(&directory, MAX_DIRECTORY_ENTRIES) {
            Ok(Some(entries)) => entries,
            Ok(None) => continue,
            Err(error) => {
                outcome.error("vendor-manifest-list", error);
                continue;
            }
        };
        for manifest in entries.into_iter().filter(|path| {
            path.extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| {
                    extension.eq_ignore_ascii_case("json") || extension.eq_ignore_ascii_case("mfst")
                })
        }) {
            let Some(text) = read_manifest(context, &manifest, outcome) else {
                continue;
            };
            let value: Value = match serde_json::from_str(&text) {
                Ok(value) => value,
                Err(error) => {
                    outcome.error(
                        "vendor-manifest",
                        format!("{}: {error}", manifest.display()),
                    );
                    continue;
                }
            };
            let name = json_string_deep(
                &value,
                &[
                    &["displayName"],
                    &["DisplayName"],
                    &["game", "displayName"],
                    &["product", "name"],
                ],
            );
            let install = json_string_deep(
                &value,
                &[
                    &["installLocation"],
                    &["InstallLocation"],
                    &["installPath"],
                    &["game", "installPath"],
                ],
            )
            .map(PathBuf::from)
            .filter(|path| context.files.is_dir(path));
            let (Some(name), Some(install)) = (name, install) else {
                continue;
            };
            if is_launcher_entry(source, &name) {
                continue;
            }
            let source_game_id = json_string_deep(
                &value,
                &[
                    &["contentId"],
                    &["productId"],
                    &["offerId"],
                    &["game", "id"],
                ],
            );
            let executable = json_string_deep(
                &value,
                &[
                    &["launchExecutable"],
                    &["executable"],
                    &["game", "executable"],
                ],
            );
            let matchers = executable_matchers(
                context.files,
                &install,
                executable.as_deref(),
                catalog_for(source, source_game_id.as_deref(), &name),
            );
            outcome.source_present = true;
            outcome.candidates.push(CandidateGame {
                source,
                source_game_id,
                name,
                install_location: Some(install),
                matchers,
            });
        }
    }
}

fn uninstall_registry_roots() -> [(RegistryHive, &'static str); 3] {
    [
        (
            RegistryHive::LocalMachine,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            RegistryHive::LocalMachine,
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            RegistryHive::CurrentUser,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
    ]
}

fn vendor_uninstall_matches(
    source: GameSource,
    key: &str,
    name: &str,
    publisher: Option<&str>,
    uninstall: Option<&str>,
    install: Option<&str>,
) -> bool {
    let haystack = [key, name, publisher.unwrap_or(""), install.unwrap_or("")]
        .join(" ")
        .to_ascii_lowercase();
    let uninstall = uninstall.unwrap_or("").to_ascii_lowercase();
    if uninstall.contains("steam.exe") || uninstall.contains("epicgameslauncher") {
        return false;
    }
    match source {
        GameSource::Ea => {
            haystack.contains("electronic arts")
                || publisher.is_some_and(|value| value.trim().eq_ignore_ascii_case("EA"))
        }
        GameSource::Ubisoft => haystack.contains("ubisoft"),
        GameSource::BattleNet => {
            haystack.contains("blizzard")
                || haystack.contains("battle.net")
                || (haystack.contains("activision") && !uninstall.contains("steam"))
        }
        _ => false,
    }
}

fn is_launcher_entry(source: GameSource, name: &str) -> bool {
    let name = normalize_title(name);
    match source {
        GameSource::Ea => matches!(name.as_str(), "ea app" | "ea desktop" | "origin"),
        GameSource::Ubisoft => {
            matches!(
                name.as_str(),
                "ubisoft connect" | "uplay" | "ubisoft game launcher"
            )
        }
        GameSource::BattleNet => matches!(
            name.as_str(),
            "battle net" | "blizzard app" | "battle net update agent"
        ),
        _ => false,
    }
}

fn registry_value(
    context: &ScanContext<'_>,
    outcome: &mut SourceOutcome,
    hive: RegistryHive,
    key: &str,
    value: &str,
) -> Option<String> {
    match context.registry.string_value(hive, key, value) {
        Ok(value) => value,
        Err(error) => {
            outcome.error("registry-value", format!("{key} [{value}]: {error}"));
            None
        }
    }
}

fn read_manifest(
    context: &ScanContext<'_>,
    path: &Path,
    outcome: &mut SourceOutcome,
) -> Option<String> {
    match context.files.read_text_limited(path, MAX_MANIFEST_BYTES) {
        Ok(text) => text,
        Err(error) => {
            outcome.error("manifest-read", error);
            None
        }
    }
}

fn steam_app_id_from_path(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|name| name.to_str())
        .and_then(|name| name.strip_prefix("appmanifest_"))
        .filter(|id| !id.is_empty() && id.chars().all(|character| character.is_ascii_digit()))
        .map(str::to_string)
}

fn json_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn json_string_deep(value: &Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in *path {
            current = current.get(*key)?;
        }
        current
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    })
}

fn executable_matchers(
    files: &dyn FileAccess,
    install_location: &Path,
    declared: Option<&str>,
    catalog: Option<&ShooterCatalogEntry>,
) -> Vec<InstalledGameMatcher> {
    let mut paths = Vec::new();
    if let Some(declared) = declared {
        let declared = clean_registry_path(declared);
        let executable = if declared.is_absolute() || looks_like_windows_absolute(&declared) {
            declared
        } else {
            join_relative(install_location, &declared.to_string_lossy())
        };
        if has_exe_extension(&executable) && files.is_file(&executable) {
            push_unique_path(&mut paths, executable);
        }
    }
    if let Some(catalog) = catalog {
        for relative in catalog.executables {
            let executable = join_relative(install_location, relative);
            if files.is_file(&executable) {
                push_unique_path(&mut paths, executable);
            }
        }
    }
    let mut matchers = paths.into_iter().map(executable_matcher).collect();
    sort_deduplicate_matchers(&mut matchers);
    matchers
}

fn executable_matcher(path: impl Into<PathBuf>) -> InstalledGameMatcher {
    InstalledGameMatcher {
        kind: InstalledGameMatcherKind::ExecutablePath,
        value: path.into().to_string_lossy().into_owned(),
    }
}

fn display_icon_path(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim();
    let executable = if let Some(rest) = trimmed.strip_prefix('"') {
        rest.find('"').map(|end| &rest[..end])?
    } else {
        let lower = trimmed.to_ascii_lowercase();
        let end = lower.find(".exe")? + 4;
        &trimmed[..end]
    };
    let path = clean_registry_path(executable);
    has_exe_extension(&path).then_some(path)
}

fn make_absolute(path: &Path, root: Option<&Path>) -> Option<PathBuf> {
    if path.is_absolute() || looks_like_windows_absolute(path) {
        Some(path.to_path_buf())
    } else {
        root.map(|root| join_relative(root, &path.to_string_lossy()))
    }
}

fn clean_registry_path(value: &str) -> PathBuf {
    PathBuf::from(value.trim().trim_matches('"').trim_end_matches(['\\', '/']))
}

fn join_relative(root: &Path, relative: &str) -> PathBuf {
    relative
        .split(['\\', '/'])
        .filter(|component| !component.is_empty() && *component != ".")
        .fold(root.to_path_buf(), |path, component| path.join(component))
}

fn has_exe_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
}

fn looks_like_windows_absolute(path: &Path) -> bool {
    let value = path.to_string_lossy().as_bytes().to_vec();
    value.len() >= 3
        && value[0].is_ascii_alphabetic()
        && value[1] == b':'
        && matches!(value[2], b'\\' | b'/')
}

fn normalize_xbox_root(path: PathBuf) -> PathBuf {
    if path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("XboxGames"))
    {
        path
    } else {
        path.join("XboxGames")
    }
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    let key = path_key(&path);
    if !paths.iter().any(|existing| path_key(existing) == key) {
        paths.push(path);
    }
}

fn path_key(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

fn expand_environment_variables(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(start) = rest.find('%') {
        output.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        let Some(end) = after.find('%') else {
            output.push_str(&rest[start..]);
            return output;
        };
        let variable = &after[..end];
        if let Some(expanded) = std::env::var_os(variable) {
            output.push_str(&expanded.to_string_lossy());
        } else {
            output.push('%');
            output.push_str(variable);
            output.push('%');
        }
        rest = &after[end + 1..];
    }
    output.push_str(rest);
    output
}

#[derive(Debug, Default, PartialEq, Eq)]
struct MicrosoftGameConfig {
    display_name: Option<String>,
    identity_name: Option<String>,
    store_id: Option<String>,
    package_family_name: Option<String>,
    executables: Vec<String>,
}

fn parse_microsoft_game_config(xml: &str) -> Result<MicrosoftGameConfig, String> {
    if xml.len() > MAX_MANIFEST_BYTES {
        return Err(format!(
            "config exceeds the {MAX_MANIFEST_BYTES} byte manifest limit"
        ));
    }
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut root_seen = false;
    let mut root_closed = false;
    let mut depth = 0usize;
    let mut capture_store_id = false;
    let mut display_name = None;
    let mut identity_name = None;
    let mut publisher_id = None;
    let mut store_id = None;
    let mut explicit_family = None;
    let mut executables = Vec::new();

    loop {
        match reader.read_event().map_err(|error| error.to_string())? {
            Event::Start(tag) => {
                if depth == 0 {
                    if root_seen || !xml_name_is(&tag, b"Game") {
                        return Err("missing Game root element".to_string());
                    }
                    root_seen = true;
                }
                collect_microsoft_game_tag(
                    &reader,
                    &tag,
                    &mut display_name,
                    &mut identity_name,
                    &mut publisher_id,
                    &mut store_id,
                    &mut explicit_family,
                    &mut executables,
                )?;
                capture_store_id = xml_name_is(&tag, b"StoreId");
                depth += 1;
            }
            Event::Empty(tag) => {
                if depth == 0 {
                    if root_seen || !xml_name_is(&tag, b"Game") {
                        return Err("missing Game root element".to_string());
                    }
                    root_seen = true;
                    root_closed = true;
                }
                collect_microsoft_game_tag(
                    &reader,
                    &tag,
                    &mut display_name,
                    &mut identity_name,
                    &mut publisher_id,
                    &mut store_id,
                    &mut explicit_family,
                    &mut executables,
                )?;
            }
            Event::Text(text) if capture_store_id && store_id.is_none() => {
                let decoded = text.xml_content().map_err(|error| error.to_string())?;
                let value = quick_xml::escape::unescape(decoded.as_ref())
                    .map_err(|error| error.to_string())?
                    .trim()
                    .to_string();
                if !value.is_empty() {
                    store_id = Some(value);
                }
            }
            Event::CData(text) if capture_store_id && store_id.is_none() => {
                let value = text
                    .xml_content()
                    .map_err(|error| error.to_string())?
                    .trim()
                    .to_string();
                if !value.is_empty() {
                    store_id = Some(value);
                }
            }
            Event::End(tag) => {
                depth = depth
                    .checked_sub(1)
                    .ok_or_else(|| "invalid XML element depth".to_string())?;
                if xml_local_name(tag.name().as_ref()).eq_ignore_ascii_case(b"StoreId") {
                    capture_store_id = false;
                }
                if depth == 0 {
                    root_closed = true;
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if !root_seen || !root_closed || depth != 0 {
        return Err("missing Game root element".to_string());
    }

    let package_family_name = explicit_family.or_else(|| {
        Some(format!(
            "{}_{}",
            identity_name.as_deref()?,
            publisher_id.as_deref()?
        ))
    });
    executables.sort_by_key(|value| value.to_ascii_lowercase());
    executables.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    if identity_name.is_none() && executables.is_empty() {
        return Err("config has neither package identity nor executable".to_string());
    }
    Ok(MicrosoftGameConfig {
        display_name,
        identity_name,
        store_id,
        package_family_name,
        executables,
    })
}

#[allow(clippy::too_many_arguments)]
fn collect_microsoft_game_tag(
    reader: &Reader<&[u8]>,
    tag: &BytesStart<'_>,
    display_name: &mut Option<String>,
    identity_name: &mut Option<String>,
    publisher_id: &mut Option<String>,
    store_id: &mut Option<String>,
    explicit_family: &mut Option<String>,
    executables: &mut Vec<String>,
) -> Result<(), String> {
    if xml_name_is(tag, b"Game") {
        *store_id = store_id.take().or(xml_attribute(reader, tag, b"StoreId")?);
        *display_name = display_name
            .take()
            .or(xml_attribute(reader, tag, b"DisplayName")?);
        *explicit_family =
            explicit_family
                .take()
                .or(xml_attribute(reader, tag, b"PackageFamilyName")?);
    } else if xml_name_is(tag, b"Identity") {
        *identity_name = identity_name
            .take()
            .or(xml_attribute(reader, tag, b"Name")?);
        *publisher_id = publisher_id
            .take()
            .or(xml_attribute(reader, tag, b"PublisherId")?);
        *explicit_family =
            explicit_family
                .take()
                .or(xml_attribute(reader, tag, b"PackageFamilyName")?);
    } else if xml_name_is(tag, b"ShellVisuals") {
        *display_name = display_name
            .take()
            .or(xml_attribute(reader, tag, b"DefaultDisplayName")?);
    } else if xml_name_is(tag, b"Executable") {
        if let Some(name) =
            xml_attribute(reader, tag, b"Name")?.filter(|name| has_exe_extension(Path::new(name)))
        {
            executables.push(name);
        }
    }
    Ok(())
}

fn xml_name_is(tag: &BytesStart<'_>, expected: &[u8]) -> bool {
    xml_local_name(tag.name().as_ref()).eq_ignore_ascii_case(expected)
}

fn xml_local_name(name: &[u8]) -> &[u8] {
    name.rsplit(|value| *value == b':').next().unwrap_or(name)
}

fn xml_attribute(
    reader: &Reader<&[u8]>,
    tag: &BytesStart<'_>,
    requested_name: &[u8],
) -> Result<Option<String>, String> {
    for attribute in tag.attributes() {
        let attribute = attribute.map_err(|error| error.to_string())?;
        if xml_local_name(attribute.key.as_ref()).eq_ignore_ascii_case(requested_name) {
            return attribute
                .decode_and_unescape_value(reader.decoder())
                .map(|value| Some(value.into_owned()))
                .map_err(|error| error.to_string());
        }
    }
    Ok(None)
}

struct ShooterCatalogEntry {
    logical_id: &'static str,
    display_name: &'static str,
    aliases: &'static [&'static str],
    steam_ids: &'static [&'static str],
    executables: &'static [&'static str],
}

const SHOOTER_CATALOG: &[ShooterCatalogEntry] = &[
    ShooterCatalogEntry {
        logical_id: "apex-legends",
        display_name: "Apex Legends",
        aliases: &["apex legends"],
        steam_ids: &["1172470"],
        executables: &["r5apex.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "counter-strike-2",
        display_name: "Counter-Strike 2",
        aliases: &["counter strike 2", "cs2"],
        steam_ids: &["730"],
        executables: &[r"game\bin\win64\cs2.exe", "cs2.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "pubg-battlegrounds",
        display_name: "PUBG: Battlegrounds",
        aliases: &["pubg battlegrounds", "playerunknowns battlegrounds"],
        steam_ids: &["578080"],
        executables: &[r"TslGame\Binaries\Win64\TslGame.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "fortnite",
        display_name: "Fortnite",
        aliases: &["fortnite"],
        steam_ids: &[],
        executables: &[r"FortniteGame\Binaries\Win64\FortniteClient-Win64-Shipping.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "overwatch-2",
        display_name: "Overwatch 2",
        aliases: &["overwatch", "overwatch 2"],
        steam_ids: &["2357570"],
        executables: &[r"_retail_\Overwatch.exe", "Overwatch.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "rainbow-six-siege",
        display_name: "Tom Clancy's Rainbow Six Siege",
        aliases: &[
            "rainbow six siege",
            "tom clancys rainbow six siege",
            "tom clancy s rainbow six siege",
        ],
        steam_ids: &["359550"],
        executables: &["RainbowSix.exe", "RainbowSix_Vulkan.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "call-of-duty",
        display_name: "Call of Duty",
        aliases: &[
            "call of duty",
            "call of duty hq",
            "call of duty warzone",
            "call of duty modern warfare ii",
            "call of duty modern warfare iii",
        ],
        steam_ids: &["1938090", "2519060"],
        executables: &["cod.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "battlefield-2042",
        display_name: "Battlefield 2042",
        aliases: &["battlefield 2042"],
        steam_ids: &["1517290"],
        executables: &["BF2042.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "battlefield-v",
        display_name: "Battlefield V",
        aliases: &["battlefield v", "battlefield 5"],
        steam_ids: &["1238810"],
        executables: &["bfv.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "battlefield-1",
        display_name: "Battlefield 1",
        aliases: &["battlefield 1"],
        steam_ids: &["1238840"],
        executables: &["bf1.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "destiny-2",
        display_name: "Destiny 2",
        aliases: &["destiny 2"],
        steam_ids: &["1085660"],
        executables: &["destiny2.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "halo-infinite",
        display_name: "Halo Infinite",
        aliases: &["halo infinite"],
        steam_ids: &["1240440"],
        executables: &["HaloInfinite.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "the-finals",
        display_name: "THE FINALS",
        aliases: &["the finals"],
        steam_ids: &["2073850"],
        executables: &[r"Discovery\Binaries\Win64\Discovery.exe", "Discovery.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "marvel-rivals",
        display_name: "Marvel Rivals",
        aliases: &["marvel rivals"],
        steam_ids: &["2767030"],
        executables: &[r"MarvelGame\Marvel\Binaries\Win64\Marvel-Win64-Shipping.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "delta-force",
        display_name: "Delta Force",
        aliases: &["delta force"],
        steam_ids: &["2507950"],
        executables: &[r"Game\DeltaForce\Binaries\Win64\DeltaForceClient-Win64-Shipping.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "hunt-showdown-1896",
        display_name: "Hunt: Showdown 1896",
        aliases: &["hunt showdown", "hunt showdown 1896"],
        steam_ids: &["594650"],
        executables: &[r"bin\win_x64\HuntGame.exe", "HuntGame.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "ready-or-not",
        display_name: "Ready or Not",
        aliases: &["ready or not"],
        steam_ids: &["1144200"],
        executables: &[r"ReadyOrNot\Binaries\Win64\ReadyOrNot-Win64-Shipping.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "warframe",
        display_name: "Warframe",
        aliases: &["warframe"],
        steam_ids: &["230410"],
        executables: &[r"x64\Warframe.x64.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "helldivers-2",
        display_name: "HELLDIVERS 2",
        aliases: &["helldivers 2"],
        steam_ids: &["553850"],
        executables: &[r"bin\helldivers2.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "insurgency-sandstorm",
        display_name: "Insurgency: Sandstorm",
        aliases: &["insurgency sandstorm"],
        steam_ids: &["581320"],
        executables: &[r"Insurgency\Binaries\Win64\InsurgencyClient-Win64-Shipping.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "squad",
        display_name: "Squad",
        aliases: &["squad"],
        steam_ids: &["393380"],
        executables: &[r"SquadGame\Binaries\Win64\SquadGame.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "titanfall-2",
        display_name: "Titanfall 2",
        aliases: &["titanfall 2"],
        steam_ids: &["1237970"],
        executables: &["Titanfall2.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "doom-eternal",
        display_name: "DOOM Eternal",
        aliases: &["doom eternal"],
        steam_ids: &["782330"],
        executables: &["DOOMEternalx64vk.exe"],
    },
    ShooterCatalogEntry {
        logical_id: "borderlands-3",
        display_name: "Borderlands 3",
        aliases: &["borderlands 3"],
        steam_ids: &["397540"],
        executables: &[r"OakGame\Binaries\Win64\Borderlands3.exe"],
    },
];

fn catalog_for(
    source: GameSource,
    source_game_id: Option<&str>,
    name: &str,
) -> Option<&'static ShooterCatalogEntry> {
    let normalized_name = normalize_title(name);
    if normalized_name.contains("valorant") || normalized_name.starts_with("riot client") {
        return None;
    }
    SHOOTER_CATALOG.iter().find(|entry| {
        (source == GameSource::Steam
            && source_game_id.is_some_and(|id| entry.steam_ids.contains(&id)))
            || entry.aliases.iter().any(|alias| {
                normalized_name == *alias
                    || normalized_name
                        .strip_prefix(alias)
                        .is_some_and(|suffix| suffix.starts_with(' '))
            })
    })
}

fn normalize_title(value: &str) -> String {
    let mut output = String::new();
    let mut pending_space = false;
    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_alphanumeric() {
            if pending_space && !output.is_empty() {
                output.push(' ');
            }
            output.push(character);
            pending_space = false;
        } else if !output.is_empty() {
            pending_space = true;
        }
    }
    output
}

fn logical_slug(value: &str) -> String {
    normalize_title(value).replace(' ', "-")
}

#[derive(Debug)]
struct AggregateGame {
    logical_id: String,
    name: String,
    is_shooter: bool,
    sources: BTreeSet<GameSource>,
    installations: Vec<InstalledGameInstallation>,
    matchers: Vec<InstalledGameMatcher>,
}

fn merge_candidates(candidates: Vec<CandidateGame>) -> Vec<InstalledGame> {
    let mut merged = BTreeMap::<String, AggregateGame>::new();
    for candidate in candidates {
        let catalog = catalog_for(
            candidate.source,
            candidate.source_game_id.as_deref(),
            &candidate.name,
        );
        let slug = logical_slug(&candidate.name);
        if slug.is_empty() {
            continue;
        }
        let logical_id = catalog
            .map(|entry| entry.logical_id.to_string())
            .unwrap_or_else(|| format!("detected-{slug}"));
        let display_name = catalog
            .map(|entry| entry.display_name.to_string())
            .unwrap_or_else(|| candidate.name.clone());
        let game = merged
            .entry(logical_id.clone())
            .or_insert_with(|| AggregateGame {
                logical_id,
                name: display_name,
                is_shooter: catalog.is_some(),
                sources: BTreeSet::new(),
                installations: Vec::new(),
                matchers: Vec::new(),
            });
        game.sources.insert(candidate.source);
        game.is_shooter |= catalog.is_some();
        game.matchers.extend(candidate.matchers.clone());
        let install_location = candidate
            .install_location
            .as_deref()
            .map(|path| path.to_string_lossy().into_owned());
        if let Some(existing) = game.installations.iter_mut().find(|installation| {
            same_installation(
                installation.source,
                installation.source_game_id.as_deref(),
                installation.install_location.as_deref(),
                candidate.source,
                candidate.source_game_id.as_deref(),
                install_location.as_deref(),
            )
        }) {
            if existing.source_game_id.is_none() {
                existing.source_game_id = candidate.source_game_id.clone();
            }
            existing.matchers.extend(candidate.matchers);
            sort_deduplicate_matchers(&mut existing.matchers);
        } else {
            game.installations.push(InstalledGameInstallation {
                source: candidate.source,
                source_game_id: candidate.source_game_id,
                install_location,
                matchers: candidate.matchers,
            });
        }
    }
    let mut games = merged
        .into_values()
        .map(|mut game| {
            sort_deduplicate_matchers(&mut game.matchers);
            game.installations.sort_by(|left, right| {
                left.source.cmp(&right.source).then_with(|| {
                    left.install_location
                        .as_deref()
                        .unwrap_or("")
                        .to_ascii_lowercase()
                        .cmp(
                            &right
                                .install_location
                                .as_deref()
                                .unwrap_or("")
                                .to_ascii_lowercase(),
                        )
                })
            });
            InstalledGame {
                logical_id: game.logical_id,
                name: game.name,
                is_shooter: game.is_shooter,
                sources: game.sources.into_iter().collect(),
                installations: game.installations,
                matchers: game.matchers,
            }
        })
        .collect::<Vec<_>>();
    games.sort_by(|left, right| {
        right.is_shooter.cmp(&left.is_shooter).then_with(|| {
            left.name
                .to_ascii_lowercase()
                .cmp(&right.name.to_ascii_lowercase())
        })
    });
    games
}

fn deduplicate_candidates(candidates: &mut Vec<CandidateGame>) {
    let mut merged = Vec::<CandidateGame>::new();
    for candidate in candidates.drain(..) {
        let install_key = candidate
            .install_location
            .as_deref()
            .map(path_key)
            .unwrap_or_default();
        if let Some(existing) = merged.iter_mut().find(|existing| {
            normalize_title(&existing.name) == normalize_title(&candidate.name)
                && same_installation(
                    existing.source,
                    existing.source_game_id.as_deref(),
                    existing
                        .install_location
                        .as_deref()
                        .map(|path| path.to_string_lossy().into_owned())
                        .as_deref(),
                    candidate.source,
                    candidate.source_game_id.as_deref(),
                    (!install_key.is_empty()).then_some(install_key.as_str()),
                )
        }) {
            if existing.source_game_id.is_none() {
                existing.source_game_id = candidate.source_game_id.clone();
            }
            existing.matchers.extend(candidate.matchers);
            sort_deduplicate_matchers(&mut existing.matchers);
        } else {
            merged.push(candidate);
        }
    }
    *candidates = merged;
}

fn same_installation(
    left_source: GameSource,
    left_id: Option<&str>,
    left_location: Option<&str>,
    right_source: GameSource,
    right_id: Option<&str>,
    right_location: Option<&str>,
) -> bool {
    if left_source != right_source {
        return false;
    }
    let same_location = left_location
        .zip(right_location)
        .is_some_and(|(left, right)| path_key(Path::new(left)) == path_key(Path::new(right)));
    let same_external_id = left_id
        .zip(right_id)
        .is_some_and(|(left, right)| left.eq_ignore_ascii_case(right));
    same_location || same_external_id
}

fn sort_deduplicate_matchers(matchers: &mut Vec<InstalledGameMatcher>) {
    matchers.sort_by(|left, right| {
        left.kind.cmp(&right.kind).then_with(|| {
            left.value
                .to_ascii_lowercase()
                .cmp(&right.value.to_ascii_lowercase())
        })
    });
    matchers.dedup_by(|left, right| {
        left.kind == right.kind && left.value.eq_ignore_ascii_case(&right.value)
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct FixtureFiles {
        files: BTreeMap<String, (PathBuf, String)>,
        directories: BTreeMap<String, PathBuf>,
        read_errors: BTreeMap<String, String>,
        list_errors: BTreeMap<String, String>,
    }

    impl FixtureFiles {
        fn directory(mut self, path: &str) -> Self {
            let path = PathBuf::from(path);
            self.directories.insert(path_key(&path), path);
            self
        }

        fn file(mut self, path: &str, content: &str) -> Self {
            let path = PathBuf::from(path);
            self.files
                .insert(path_key(&path), (path, content.to_string()));
            self
        }

        fn list_error(mut self, path: &str, error: &str) -> Self {
            self.list_errors
                .insert(path_key(Path::new(path)), error.to_string());
            self
        }
    }

    impl FileAccess for FixtureFiles {
        fn read_text_limited(
            &self,
            path: &Path,
            max_bytes: usize,
        ) -> Result<Option<String>, String> {
            let key = path_key(path);
            if let Some(error) = self.read_errors.get(&key) {
                return Err(error.clone());
            }
            let Some((_, content)) = self.files.get(&key) else {
                return Ok(None);
            };
            if content.len() > max_bytes {
                return Err("fixture exceeds manifest limit".to_string());
            }
            Ok(Some(content.clone()))
        }

        fn list_dir(
            &self,
            path: &Path,
            max_entries: usize,
        ) -> Result<Option<Vec<PathBuf>>, String> {
            let key = path_key(path);
            if let Some(error) = self.list_errors.get(&key) {
                return Err(error.clone());
            }
            if !self.directories.contains_key(&key) {
                return Ok(None);
            }
            let mut entries = self
                .directories
                .iter()
                .filter(|(candidate, _)| fixture_parent_key(candidate) == key)
                .map(|(_, path)| path.clone())
                .chain(
                    self.files
                        .iter()
                        .filter(|(candidate, _)| fixture_parent_key(candidate) == key)
                        .map(|(_, (path, _))| path.clone()),
                )
                .collect::<Vec<_>>();
            entries.sort_by_key(|path| path_key(path));
            entries.dedup_by(|left, right| path_key(left) == path_key(right));
            if entries.len() > max_entries {
                return Err("fixture exceeds directory limit".to_string());
            }
            Ok(Some(entries))
        }

        fn is_file(&self, path: &Path) -> bool {
            self.files.contains_key(&path_key(path))
        }

        fn is_dir(&self, path: &Path) -> bool {
            self.directories.contains_key(&path_key(path))
        }
    }

    fn fixture_parent_key(path: &str) -> String {
        path.rsplit_once('\\')
            .map(|(parent, _)| parent.to_string())
            .unwrap_or_default()
    }

    #[derive(Default)]
    struct FixtureRegistry {
        values: BTreeMap<(RegistryHive, String, String), String>,
        children: BTreeMap<(RegistryHive, String), Vec<String>>,
        errors: BTreeMap<(RegistryHive, String), String>,
    }

    impl FixtureRegistry {
        fn value(mut self, hive: RegistryHive, key: &str, name: &str, value: &str) -> Self {
            self.values.insert(
                (hive, key.to_ascii_lowercase(), name.to_ascii_lowercase()),
                value.to_string(),
            );
            self
        }

        fn subkeys(mut self, hive: RegistryHive, key: &str, values: &[&str]) -> Self {
            self.children.insert(
                (hive, key.to_ascii_lowercase()),
                values.iter().map(|value| (*value).to_string()).collect(),
            );
            self
        }
    }

    impl RegistryAccess for FixtureRegistry {
        fn string_value(
            &self,
            hive: RegistryHive,
            key: &str,
            value: &str,
        ) -> Result<Option<String>, String> {
            if let Some(error) = self.errors.get(&(hive, key.to_ascii_lowercase())) {
                return Err(error.clone());
            }
            Ok(self
                .values
                .get(&(hive, key.to_ascii_lowercase(), value.to_ascii_lowercase()))
                .cloned())
        }

        fn subkeys(&self, hive: RegistryHive, key: &str) -> Result<Option<Vec<String>>, String> {
            if let Some(error) = self.errors.get(&(hive, key.to_ascii_lowercase())) {
                return Err(error.clone());
            }
            Ok(self
                .children
                .get(&(hive, key.to_ascii_lowercase()))
                .cloned())
        }
    }

    fn roots() -> ScanRoots {
        ScanRoots {
            program_data: PathBuf::from(r"X:\ProgramData"),
            program_files_x86: PathBuf::from(r"X:\Program Files (x86)"),
            system_drive: PathBuf::from(r"X:\"),
        }
    }

    fn uninstall_root() -> &'static str {
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
    }

    #[test]
    fn scans_all_six_sources_and_merges_exact_matchers() {
        let files = FixtureFiles::default()
            .directory(r"X:\Steam")
            .directory(r"X:\Steam\steamapps")
            .directory(r"X:\Steam\steamapps\common")
            .directory(r"X:\Steam\steamapps\common\Apex Legends")
            .file(
                r"X:\Steam\steamapps\libraryfolders.vdf",
                r#""libraryfolders"
                {
                    "0" { "path" "X:\\Steam" "apps" { "1172470" "1" } }
                }"#,
            )
            .file(
                r"X:\Steam\steamapps\appmanifest_1172470.acf",
                r#""AppState" { "appid" "1172470" "name" "Apex Legends" "installdir" "Apex Legends" }"#,
            )
            .file(r"X:\Steam\steamapps\common\Apex Legends\r5apex.exe", "")
            .directory(r"X:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests")
            .directory(r"X:\Games\Fortnite")
            .directory(r"X:\Games\Fortnite\FortniteGame")
            .directory(r"X:\Games\Fortnite\FortniteGame\Binaries")
            .directory(r"X:\Games\Fortnite\FortniteGame\Binaries\Win64")
            .file(
                r"X:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\fortnite.item",
                r#"{"DisplayName":"Fortnite","InstallLocation":"X:\\Games\\Fortnite","LaunchExecutable":"FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe","CatalogItemId":"fn"}"#,
            )
            .file(
                r"X:\Games\Fortnite\FortniteGame\Binaries\Win64\FortniteClient-Win64-Shipping.exe",
                "",
            )
            .directory(r"X:\XboxGames")
            .directory(r"X:\XboxGames\Halo Infinite")
            .directory(r"X:\XboxGames\Halo Infinite\Content")
            .file(
                r"X:\XboxGames\Halo Infinite\Content\MicrosoftGame.config",
                r#"<Game StoreId="9PP5G1F0C2B6"><Identity Name="Microsoft.254428597CFE2" PublisherId="8wekyb3d8bbwe"/><ShellVisuals DefaultDisplayName="Halo Infinite"/><ExecutableList><Executable Name="HaloInfinite.exe"/></ExecutableList></Game>"#,
            )
            .file(r"X:\XboxGames\Halo Infinite\Content\HaloInfinite.exe", "")
            .directory(r"X:\EA\Battlefield 2042")
            .file(r"X:\EA\Battlefield 2042\BF2042.exe", "")
            .directory(r"X:\Ubisoft\Rainbow Six Siege")
            .file(r"X:\Ubisoft\Rainbow Six Siege\RainbowSix.exe", "")
            .directory(r"X:\Blizzard\Overwatch")
            .directory(r"X:\Blizzard\Overwatch\_retail_")
            .file(r"X:\Blizzard\Overwatch\_retail_\Overwatch.exe", "");
        let registry = FixtureRegistry::default()
            .value(
                RegistryHive::CurrentUser,
                r"Software\Valve\Steam",
                "SteamPath",
                r"X:\Steam",
            )
            .subkeys(
                RegistryHive::LocalMachine,
                uninstall_root(),
                &["ea-bf2042", "ubi-r6", "blizzard-overwatch"],
            )
            .value(
                RegistryHive::LocalMachine,
                &format!(r"{}\ea-bf2042", uninstall_root()),
                "DisplayName",
                "Battlefield 2042",
            )
            .value(
                RegistryHive::LocalMachine,
                &format!(r"{}\ea-bf2042", uninstall_root()),
                "Publisher",
                "Electronic Arts",
            )
            .value(
                RegistryHive::LocalMachine,
                &format!(r"{}\ea-bf2042", uninstall_root()),
                "InstallLocation",
                r"X:\EA\Battlefield 2042",
            )
            .value(
                RegistryHive::LocalMachine,
                &format!(r"{}\ubi-r6", uninstall_root()),
                "DisplayName",
                "Tom Clancy's Rainbow Six Siege",
            )
            .value(
                RegistryHive::LocalMachine,
                &format!(r"{}\ubi-r6", uninstall_root()),
                "Publisher",
                "Ubisoft",
            )
            .value(
                RegistryHive::LocalMachine,
                &format!(r"{}\ubi-r6", uninstall_root()),
                "InstallLocation",
                r"X:\Ubisoft\Rainbow Six Siege",
            )
            .value(
                RegistryHive::LocalMachine,
                &format!(r"{}\blizzard-overwatch", uninstall_root()),
                "DisplayName",
                "Overwatch 2",
            )
            .value(
                RegistryHive::LocalMachine,
                &format!(r"{}\blizzard-overwatch", uninstall_root()),
                "Publisher",
                "Blizzard Entertainment",
            )
            .value(
                RegistryHive::LocalMachine,
                &format!(r"{}\blizzard-overwatch", uninstall_root()),
                "InstallLocation",
                r"X:\Blizzard\Overwatch",
            );
        let roots = roots();
        let report = scan_with(&ScanContext {
            files: &files,
            registry: &registry,
            roots: &roots,
        });

        assert_eq!(report.sources.len(), 6);
        assert!(report
            .sources
            .iter()
            .all(|source| source.status == GameScanSourceStatus::Completed));
        assert_eq!(report.games.len(), 6);
        assert!(report.games.iter().all(|game| game.is_shooter));
        assert!(report.games.iter().all(|game| !game.matchers.is_empty()));
        let halo = report
            .games
            .iter()
            .find(|game| game.logical_id == "halo-infinite")
            .unwrap();
        assert!(halo.matchers.iter().any(|matcher| {
            matcher.kind == InstalledGameMatcherKind::PackageFamilyName
                && matcher.value == "Microsoft.254428597CFE2_8wekyb3d8bbwe"
        }));
    }

    #[test]
    fn a_broken_manifest_only_marks_its_source_partial() {
        let files = FixtureFiles::default()
            .directory(r"X:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests")
            .directory(r"X:\Games\Fortnite")
            .file(
                r"X:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\broken.item",
                "{not-json",
            )
            .file(
                r"X:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\valid.item",
                r#"{"DisplayName":"Fortnite","InstallLocation":"X:\\Games\\Fortnite","CatalogItemId":"fn"}"#,
            );
        let registry = FixtureRegistry::default();
        let roots = roots();
        let report = scan_with(&ScanContext {
            files: &files,
            registry: &registry,
            roots: &roots,
        });
        let epic = report
            .sources
            .iter()
            .find(|source| source.source == GameSource::Epic)
            .unwrap();
        assert_eq!(epic.status, GameScanSourceStatus::Partial);
        assert_eq!(epic.game_count, 1);
        assert_eq!(epic.errors.len(), 1);
        assert!(report
            .sources
            .iter()
            .filter(|source| {
                source.source != GameSource::Epic
                    && source.status != GameScanSourceStatus::NotInstalled
            })
            .next()
            .is_none());
    }

    #[test]
    fn merges_the_same_catalog_game_across_platforms() {
        let candidates = vec![
            CandidateGame {
                source: GameSource::Steam,
                source_game_id: Some("1172470".to_string()),
                name: "Apex Legends".to_string(),
                install_location: Some(PathBuf::from(r"X:\Steam\Apex")),
                matchers: vec![executable_matcher(r"X:\Steam\Apex\r5apex.exe")],
            },
            CandidateGame {
                source: GameSource::Ea,
                source_game_id: Some("apex".to_string()),
                name: "Apex Legends".to_string(),
                install_location: Some(PathBuf::from(r"X:\EA\Apex")),
                matchers: vec![executable_matcher(r"X:\EA\Apex\r5apex.exe")],
            },
            CandidateGame {
                source: GameSource::Steam,
                source_game_id: Some("steam-uninstall-1172470".to_string()),
                name: "Apex Legends".to_string(),
                install_location: Some(PathBuf::from(r"X:\Steam\Apex")),
                matchers: vec![executable_matcher(r"X:\Steam\Apex\r5apex.exe")],
            },
        ];
        let games = merge_candidates(candidates);
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].logical_id, "apex-legends");
        assert_eq!(games[0].sources, vec![GameSource::Steam, GameSource::Ea]);
        assert_eq!(games[0].installations.len(), 2);
        assert_eq!(games[0].matchers.len(), 2);
    }

    #[test]
    fn excludes_valorant_from_the_builtin_shooter_catalog() {
        assert!(catalog_for(GameSource::Epic, None, "VALORANT").is_none());
        let games = merge_candidates(vec![CandidateGame {
            source: GameSource::Epic,
            source_game_id: None,
            name: "VALORANT".to_string(),
            install_location: None,
            matchers: Vec::new(),
        }]);
        assert_eq!(games.len(), 1);
        assert!(!games[0].is_shooter);
    }

    #[test]
    fn rejects_unbounded_or_invalid_xbox_xml() {
        assert!(parse_microsoft_game_config("<Game></Game>").is_err());
        assert!(parse_microsoft_game_config(&"x".repeat(MAX_MANIFEST_BYTES + 1)).is_err());
        let parsed = parse_microsoft_game_config(
            r#"<Game><Identity Name="Game.Name" PackageFamilyName="Game.Name_pub"/><ShellVisuals DefaultDisplayName="A &amp; B"/><ExecutableList><Executable Name="Game.exe"/><Executable Name="README.txt"/></ExecutableList></Game>"#,
        )
        .unwrap();
        assert_eq!(parsed.display_name.as_deref(), Some("A & B"));
        assert_eq!(parsed.executables, vec!["Game.exe"]);
        assert_eq!(parsed.package_family_name.as_deref(), Some("Game.Name_pub"));
    }

    #[test]
    fn keeps_directory_failures_local_to_one_source() {
        let files = FixtureFiles::default().list_error(
            r"X:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests",
            "access denied",
        );
        let registry = FixtureRegistry::default();
        let roots = roots();
        let report = scan_with(&ScanContext {
            files: &files,
            registry: &registry,
            roots: &roots,
        });
        let epic = report
            .sources
            .iter()
            .find(|source| source.source == GameSource::Epic)
            .unwrap();
        assert_eq!(epic.status, GameScanSourceStatus::Failed);
        assert_eq!(epic.errors[0].message, "access denied");
        assert!(report.sources.iter().all(|source| {
            source.source == GameSource::Epic || source.status == GameScanSourceStatus::NotInstalled
        }));
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "explicit read-only gate for locally installed Steam and EA libraries"]
    fn local_read_only_scans_only_steam_and_ea() {
        let files = RealFileAccess;
        let registry = RealRegistryAccess;
        let roots = ScanRoots::system();
        let context = ScanContext {
            files: &files,
            registry: &registry,
            roots: &roots,
        };

        for (source, outcome) in [
            (GameSource::Steam, scan_steam(&context)),
            (GameSource::Ea, scan_vendor(&context, GameSource::Ea)),
        ] {
            let report = outcome.report(source);
            println!(
                "source={source:?} status={:?} games={} errors={}",
                report.status,
                report.game_count,
                report.errors.len()
            );
            assert_ne!(report.status, GameScanSourceStatus::Failed);
        }
    }
}
