use crate::game::{apex, apex_defaults, apex_settings, ea_desktop};
use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::blocking_cmd;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
#[cfg(test)]
use chrono::DateTime;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use winapi::um::errhandlingapi::GetLastError;
#[cfg(windows)]
use winapi::um::winbase::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};

const HISTORY_SCHEMA_VERSION: u32 = 1;
const HISTORY_LIMIT_PER_STREAM: usize = 30;
const LEGACY_IMPORT_MARKER: &str = ".legacy-backup-imported-v1";
static HISTORY_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ApexConfigScope {
    Launch,
    Video,
    GameSettings,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ApexHistorySource {
    #[default]
    Apply,
    QuickPreset,
    Import,
    Reset,
    HistoryRestore,
    LegacyBackup,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexLauncherRef {
    pub kind: String,
    pub id: String,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredFile {
    path: String,
    existed: bool,
    readonly: bool,
    sha256: String,
    content_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredEntry {
    schema_version: u32,
    id: String,
    transaction_id: String,
    created_at: String,
    source: ApexHistorySource,
    scopes: Vec<ApexConfigScope>,
    launcher: Option<ApexLauncherRef>,
    launch_options: Option<String>,
    video: Option<StoredFile>,
    settings: Option<StoredFile>,
    profile: Option<StoredFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexConfigHistoryEntry {
    pub id: String,
    pub transaction_id: String,
    pub created_at: String,
    pub source: ApexHistorySource,
    pub scopes: Vec<ApexConfigScope>,
    pub launcher: Option<ApexLauncherRef>,
}

#[derive(Debug)]
pub(crate) struct ApexScopedHistoryRecord {
    pub entry: ApexConfigHistoryEntry,
    pub scope_added: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexHistoryRestoreRequest {
    pub entry_id: String,
    pub launcher: Option<ApexLauncherRef>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexHistoryRestoreResult {
    pub history_entry: ApexConfigHistoryEntry,
    pub restored_scopes: Vec<ApexConfigScope>,
    pub pending_default_generation: bool,
    pub pending_scopes: Vec<ApexConfigScope>,
    pub launch_options: Option<String>,
    pub video_config: Option<HashMap<String, String>>,
    pub game_settings_report: Option<apex_settings::ApexGameSettingsReport>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexResetResult {
    pub history_entry: ApexConfigHistoryEntry,
    pub pending_scopes: Vec<ApexConfigScope>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexConfigMutationRequest {
    #[serde(default)]
    pub source: ApexHistorySource,
    #[serde(default)]
    pub transaction_id: Option<String>,
    #[serde(default)]
    pub launcher: Option<ApexLauncherRef>,
    #[serde(default)]
    pub launch_options: Option<String>,
    #[serde(default)]
    pub video_updates: HashMap<String, String>,
    #[serde(default)]
    pub game_settings: Option<apex_settings::ApexGameSettingsApplyRequest>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexConfigMutationResult {
    pub history_entry: Option<ApexConfigHistoryEntry>,
    pub changed_scopes: Vec<ApexConfigScope>,
    pub launch_options: Option<String>,
    pub video_config: Option<HashMap<String, String>>,
    pub game_settings_report: Option<apex_settings::ApexGameSettingsReport>,
}

fn history_error(error: impl Into<String>) -> IpcError {
    IpcError::operation_failed("apex_history", error.into())
}

pub(crate) fn lock_history() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    HISTORY_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "apex.history.errors.lockFailed".to_string())
}

fn history_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("apex.history.errors.storageUnavailable: {error}"))?
        .join("apex-history")
        .join("v1");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("apex.history.errors.storageUnavailable: {error}"))?;
    Ok(dir)
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn generated_id(prefix: &str) -> String {
    let counter = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{}-{}-{counter}", now_millis(), std::process::id())
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn resolve_transaction_id(value: Option<&str>) -> String {
    value
        .filter(|candidate| valid_id(candidate))
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| generated_id("apex"))
}

fn entry_path(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("apex.history.errors.invalidEntry".to_string());
    }
    Ok(dir.join(format!("{id}.json")))
}

fn sha256(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn capture_file(path: &Path) -> Result<StoredFile, String> {
    if !path.is_file() {
        return Ok(StoredFile {
            path: path.to_string_lossy().into_owned(),
            existed: false,
            readonly: false,
            sha256: sha256(&[]),
            content_base64: String::new(),
        });
    }
    let bytes = fs::read(path).map_err(|error| {
        format!(
            "apex.history.errors.readFailed: {}: {error}",
            path.display()
        )
    })?;
    let readonly = fs::metadata(path)
        .map(|metadata| metadata.permissions().readonly())
        .unwrap_or(false);
    Ok(StoredFile {
        path: path.to_string_lossy().into_owned(),
        existed: true,
        readonly,
        sha256: sha256(&bytes),
        content_base64: BASE64.encode(bytes),
    })
}

fn stored_file_for_bytes(target: &Path, bytes: Vec<u8>) -> StoredFile {
    StoredFile {
        path: target.to_string_lossy().into_owned(),
        existed: true,
        readonly: false,
        sha256: sha256(&bytes),
        content_base64: BASE64.encode(bytes),
    }
}

fn verified_bytes(file: &StoredFile) -> Result<Vec<u8>, String> {
    let bytes = if file.existed {
        BASE64
            .decode(&file.content_base64)
            .map_err(|error| format!("apex.history.errors.corruptEntry: {error}"))?
    } else {
        Vec::new()
    };
    if sha256(&bytes) != file.sha256 {
        return Err("apex.history.errors.corruptEntry".to_string());
    }
    Ok(bytes)
}

fn unique_temp_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy())
        .unwrap_or_default();
    path.with_file_name(format!(
        ".{name}.{}.{}.tmp",
        std::process::id(),
        now_millis()
    ))
}

#[cfg(windows)]
fn replace_file(from: &Path, to: &Path) -> Result<(), String> {
    let mut from_wide: Vec<u16> = from.as_os_str().encode_wide().collect();
    from_wide.push(0);
    let mut to_wide: Vec<u16> = to.as_os_str().encode_wide().collect();
    to_wide.push(0);
    let ok = unsafe {
        MoveFileExW(
            from_wide.as_ptr(),
            to_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        Err(format!("MoveFileExW failed: {}", unsafe { GetLastError() }))
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        fs::remove_file(to).map_err(|error| error.to_string())?;
    }
    fs::rename(from, to).map_err(|error| error.to_string())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temp = unique_temp_path(path);
    let write_result = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp)
            .map_err(|error| error.to_string())?;
        file.write_all(bytes).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        replace_file(&temp, path)
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    write_result
}

fn save_entry(dir: &Path, entry: &StoredEntry) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(entry)
        .map_err(|error| format!("apex.history.errors.writeFailed: {error}"))?;
    atomic_write(&entry_path(dir, &entry.id)?, &bytes)
        .map_err(|error| format!("apex.history.errors.writeFailed: {error}"))
}

fn load_entry(path: &Path) -> Result<StoredEntry, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("apex.history.errors.readFailed: {error}"))?;
    let entry: StoredEntry = serde_json::from_slice(&bytes)
        .map_err(|error| format!("apex.history.errors.corruptEntry: {error}"))?;
    if entry.schema_version != HISTORY_SCHEMA_VERSION || !valid_id(&entry.id) {
        return Err("apex.history.errors.unsupportedVersion".to_string());
    }
    Ok(entry)
}

fn load_entry_by_id(dir: &Path, id: &str) -> Result<StoredEntry, String> {
    load_entry(&entry_path(dir, id)?)
}

fn load_entries(dir: &Path) -> Result<Vec<StoredEntry>, String> {
    let mut entries = Vec::new();
    for item in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = item.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        entries.push(load_entry(&path)?);
    }
    Ok(entries)
}

fn summary(entry: &StoredEntry) -> ApexConfigHistoryEntry {
    ApexConfigHistoryEntry {
        id: entry.id.clone(),
        transaction_id: entry.transaction_id.clone(),
        created_at: entry.created_at.clone(),
        source: entry.source,
        scopes: entry.scopes.clone(),
        launcher: entry.launcher.clone(),
    }
}

fn same_launcher(left: &ApexLauncherRef, right: &ApexLauncherRef) -> bool {
    left.kind == right.kind && left.id == right.id
}

fn stream_keys(entry: &StoredEntry) -> Vec<String> {
    let mut keys = Vec::new();
    for scope in &entry.scopes {
        match scope {
            ApexConfigScope::Launch => {
                if let Some(launcher) = &entry.launcher {
                    keys.push(format!("launch:{}:{}", launcher.kind, launcher.id));
                }
            }
            ApexConfigScope::Video => keys.push("video".to_string()),
            ApexConfigScope::GameSettings => keys.push("gameSettings".to_string()),
        }
    }
    keys
}

fn scope_stream_key(entry: &StoredEntry, scope: ApexConfigScope) -> Option<String> {
    match scope {
        ApexConfigScope::Launch => entry
            .launcher
            .as_ref()
            .map(|launcher| format!("launch:{}:{}", launcher.kind, launcher.id)),
        ApexConfigScope::Video => Some("video".to_string()),
        ApexConfigScope::GameSettings => Some("gameSettings".to_string()),
    }
}

fn prune_locked(dir: &Path) -> Result<(), String> {
    let mut entries = load_entries(dir)?;
    let mut by_stream: HashMap<String, Vec<&StoredEntry>> = HashMap::new();
    for entry in &entries {
        for key in stream_keys(entry) {
            by_stream.entry(key).or_default().push(entry);
        }
    }
    let mut keep_by_stream: HashMap<String, HashSet<String>> = HashMap::new();
    for (key, stream) in &mut by_stream {
        stream.sort_by(|left, right| {
            right
                .created_at
                .cmp(&left.created_at)
                .then_with(|| right.id.cmp(&left.id))
        });
        keep_by_stream.insert(
            key.clone(),
            stream
                .iter()
                .take(HISTORY_LIMIT_PER_STREAM)
                .map(|entry| entry.id.clone())
                .collect(),
        );
    }
    for entry in &mut entries {
        let original_scopes = entry.scopes.clone();
        let entry_id = entry.id.clone();
        let scope_keys: HashMap<ApexConfigScope, Option<String>> = original_scopes
            .iter()
            .map(|scope| (*scope, scope_stream_key(entry, *scope)))
            .collect();
        entry.scopes.retain(|scope| {
            scope_keys
                .get(scope)
                .and_then(Clone::clone)
                .is_some_and(|key| {
                    keep_by_stream
                        .get(&key)
                        .is_some_and(|ids| ids.contains(&entry_id))
                })
        });
        if entry.scopes.is_empty() {
            fs::remove_file(entry_path(dir, &entry.id)?)
                .map_err(|error| format!("apex.history.errors.pruneFailed: {error}"))?;
            continue;
        }
        if entry.scopes != original_scopes {
            if !entry.scopes.contains(&ApexConfigScope::Launch) {
                entry.launcher = None;
                entry.launch_options = None;
            }
            if !entry.scopes.contains(&ApexConfigScope::Video) {
                entry.video = None;
            }
            if !entry.scopes.contains(&ApexConfigScope::GameSettings) {
                entry.settings = None;
                entry.profile = None;
            }
            save_entry(dir, entry)?;
        }
    }
    Ok(())
}

struct RecordParts {
    launcher: Option<ApexLauncherRef>,
    launch_options: Option<String>,
    video: Option<StoredFile>,
    settings: Option<StoredFile>,
    profile: Option<StoredFile>,
}

fn record_locked(
    dir: &Path,
    source: ApexHistorySource,
    transaction_id: Option<&str>,
    parts: RecordParts,
) -> Result<ApexConfigHistoryEntry, String> {
    let id = resolve_transaction_id(transaction_id);
    let path = entry_path(dir, &id)?;
    let mut entry = if path.is_file() {
        let existing = load_entry(&path)?;
        if existing.source != source {
            return Err("apex.history.errors.transactionConflict".to_string());
        }
        existing
    } else {
        StoredEntry {
            schema_version: HISTORY_SCHEMA_VERSION,
            id: id.clone(),
            transaction_id: id.clone(),
            created_at: Utc::now().to_rfc3339(),
            source,
            scopes: Vec::new(),
            launcher: None,
            launch_options: None,
            video: None,
            settings: None,
            profile: None,
        }
    };

    if let Some(launcher) = parts.launcher {
        if let Some(existing) = &entry.launcher {
            if !same_launcher(existing, &launcher) {
                return Err("apex.history.errors.accountMismatch".to_string());
            }
        } else {
            entry.launcher = Some(launcher);
        }
    }
    if let Some(value) = parts.launch_options {
        if entry.launch_options.is_none() {
            entry.launch_options = Some(value);
        }
        entry.scopes.push(ApexConfigScope::Launch);
    }
    if let Some(value) = parts.video {
        if entry.video.is_none() {
            entry.video = Some(value);
        }
        entry.scopes.push(ApexConfigScope::Video);
    }
    if parts.settings.is_some() || parts.profile.is_some() {
        if entry.settings.is_none() {
            entry.settings = parts.settings;
        }
        if entry.profile.is_none() {
            entry.profile = parts.profile;
        }
        entry.scopes.push(ApexConfigScope::GameSettings);
    }
    entry.scopes.sort_by_key(|scope| match scope {
        ApexConfigScope::Launch => 0,
        ApexConfigScope::Video => 1,
        ApexConfigScope::GameSettings => 2,
    });
    entry.scopes.dedup();
    save_entry(dir, &entry)?;
    Ok(summary(&entry))
}

pub(crate) fn prune_history_locked(app: &tauri::AppHandle) -> Result<(), String> {
    prune_locked(&history_dir(app)?)
}

fn record_scope_locked(
    dir: &Path,
    source: ApexHistorySource,
    transaction_id: Option<&str>,
    scope: ApexConfigScope,
    parts: RecordParts,
) -> Result<ApexScopedHistoryRecord, String> {
    let transaction_id = resolve_transaction_id(transaction_id);
    let path = entry_path(dir, &transaction_id)?;
    let scope_added = match fs::metadata(&path) {
        Ok(metadata) if metadata.is_file() => {
            let existing = load_entry(&path)?;
            let already_recorded = existing.scopes.contains(&scope)
                || match scope {
                    ApexConfigScope::Launch => existing.launch_options.is_some(),
                    ApexConfigScope::Video => existing.video.is_some(),
                    ApexConfigScope::GameSettings => {
                        existing.settings.is_some() || existing.profile.is_some()
                    }
                };
            !already_recorded
        }
        Ok(_) => return Err("apex.history.errors.invalidEntry".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
        Err(error) => {
            return Err(format!(
                "apex.history.errors.readFailed: {}: {error}",
                path.display()
            ))
        }
    };
    let entry = record_locked(dir, source, Some(&transaction_id), parts)?;
    Ok(ApexScopedHistoryRecord { entry, scope_added })
}

fn discard_scope_locked(dir: &Path, id: &str, scope: ApexConfigScope) -> Result<(), String> {
    let path = entry_path(dir, id)?;
    if !path.is_file() {
        return Ok(());
    }
    let mut entry = load_entry(&path)?;
    entry.scopes.retain(|value| *value != scope);
    match scope {
        ApexConfigScope::Launch => entry.launch_options = None,
        ApexConfigScope::Video => entry.video = None,
        ApexConfigScope::GameSettings => {
            entry.settings = None;
            entry.profile = None;
        }
    }
    if entry.scopes.is_empty() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    } else {
        save_entry(dir, &entry)?;
    }
    Ok(())
}

pub(crate) fn record_launch_before_locked(
    app: &tauri::AppHandle,
    source: ApexHistorySource,
    transaction_id: Option<&str>,
    launcher: ApexLauncherRef,
    current: String,
) -> Result<ApexScopedHistoryRecord, String> {
    let dir = history_dir(app)?;
    record_scope_locked(
        &dir,
        source,
        transaction_id,
        ApexConfigScope::Launch,
        RecordParts {
            launcher: Some(launcher),
            launch_options: Some(current),
            video: None,
            settings: None,
            profile: None,
        },
    )
}

pub(crate) fn record_video_before_locked(
    app: &tauri::AppHandle,
    source: ApexHistorySource,
    transaction_id: Option<&str>,
) -> Result<ApexScopedHistoryRecord, String> {
    let dir = history_dir(app)?;
    let video = capture_file(&apex::apex_video_config_path()?)?;
    record_scope_locked(
        &dir,
        source,
        transaction_id,
        ApexConfigScope::Video,
        RecordParts {
            launcher: None,
            launch_options: None,
            video: Some(video),
            settings: None,
            profile: None,
        },
    )
}

pub(crate) fn record_game_settings_before_locked(
    app: &tauri::AppHandle,
    source: ApexHistorySource,
    transaction_id: Option<&str>,
) -> Result<ApexScopedHistoryRecord, String> {
    let dir = history_dir(app)?;
    let (settings_path, profile_path) = apex_settings::apex_game_settings_paths()?;
    record_scope_locked(
        &dir,
        source,
        transaction_id,
        ApexConfigScope::GameSettings,
        RecordParts {
            launcher: None,
            launch_options: None,
            video: None,
            settings: Some(capture_file(&settings_path)?),
            profile: Some(capture_file(&profile_path)?),
        },
    )
}

pub(crate) fn prepare_legacy_game_settings_import_locked(
    app: &tauri::AppHandle,
) -> Result<(), String> {
    let dir = history_dir(app)?;
    import_legacy_locked(&dir)
}

pub(crate) fn discard_scope_locked_for_app(
    app: &tauri::AppHandle,
    id: &str,
    scope: ApexConfigScope,
) -> Result<(), String> {
    discard_scope_locked(&history_dir(app)?, id, scope)
}

fn legacy_backup_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy())
        .unwrap_or_default();
    path.with_file_name(format!("{name}.mxtools.bak"))
}

fn read_optional_file(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "apex.history.errors.readFailed: {}: {error}",
            path.display()
        )),
    }
}

fn import_legacy_paths_locked(
    dir: &Path,
    settings_path: &Path,
    profile_path: &Path,
) -> Result<(), String> {
    let settings_backup = legacy_backup_path(settings_path);
    let profile_backup = legacy_backup_path(profile_path);
    let settings_bytes = read_optional_file(&settings_backup)?;
    let profile_bytes = read_optional_file(&profile_backup)?;
    if settings_bytes.is_none() && profile_bytes.is_none() {
        return Ok(());
    }
    let mut digest = Sha256::new();
    digest.update(b"settings\0");
    if let Some(bytes) = &settings_bytes {
        digest.update(bytes.len().to_le_bytes());
        digest.update(bytes);
    }
    digest.update(b"profile\0");
    if let Some(bytes) = &profile_bytes {
        digest.update(bytes.len().to_le_bytes());
        digest.update(bytes);
    }
    let fingerprint = hex::encode(digest.finalize());
    let id = format!("legacy-{}", &fingerprint[..24]);
    if entry_path(dir, &id)?.is_file() {
        return Ok(());
    }
    let entry = StoredEntry {
        schema_version: HISTORY_SCHEMA_VERSION,
        id: id.clone(),
        transaction_id: id,
        created_at: Utc::now().to_rfc3339(),
        source: ApexHistorySource::LegacyBackup,
        scopes: vec![ApexConfigScope::GameSettings],
        launcher: None,
        launch_options: None,
        video: None,
        settings: settings_bytes.map(|bytes| stored_file_for_bytes(settings_path, bytes)),
        profile: profile_bytes.map(|bytes| stored_file_for_bytes(profile_path, bytes)),
    };
    save_entry(dir, &entry)?;
    prune_locked(dir)
}

fn import_legacy_locked(dir: &Path) -> Result<(), String> {
    let Ok((settings_path, profile_path)) = apex_settings::apex_game_settings_paths() else {
        return Ok(());
    };
    import_legacy_once_paths_locked(dir, &settings_path, &profile_path)
}

fn import_legacy_once_paths_locked(
    dir: &Path,
    settings_path: &Path,
    profile_path: &Path,
) -> Result<(), String> {
    let marker = dir.join(LEGACY_IMPORT_MARKER);
    match fs::metadata(&marker) {
        Ok(metadata) if metadata.is_file() => return Ok(()),
        Ok(_) => return Err("apex.history.errors.invalidEntry".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "apex.history.errors.readFailed: {}: {error}",
                marker.display()
            ))
        }
    }
    import_legacy_paths_locked(dir, settings_path, profile_path)?;
    fs::write(&marker, b"imported")
        .map_err(|error| format!("write {} failed: {error}", marker.display()))
}

fn read_launch(launcher: &ApexLauncherRef) -> Result<String, String> {
    match launcher.kind.as_str() {
        "steam" => {
            let id = launcher
                .id
                .parse::<usize>()
                .map_err(|_| "apex.history.errors.invalidAccount".to_string())?;
            apex::read_steam_launch_options(id)
        }
        "ea" => ea_desktop::read_ea_launch_options(&launcher.id),
        _ => Err("apex.history.errors.invalidAccount".to_string()),
    }
}

fn write_launch(launcher: &ApexLauncherRef, value: &str) -> Result<(), String> {
    match launcher.kind.as_str() {
        "steam" => {
            let id = launcher
                .id
                .parse::<usize>()
                .map_err(|_| "apex.history.errors.invalidAccount".to_string())?;
            apex::write_steam_launch_options(id, value)
        }
        "ea" => ea_desktop::write_ea_launch_options(&launcher.id, value),
        _ => Err("apex.history.errors.invalidAccount".to_string()),
    }
}

fn launcher_is_running(launcher: &ApexLauncherRef) -> Result<bool, String> {
    match launcher.kind.as_str() {
        "steam" => crate::game::steam::steam_is_running_sync(),
        "ea" => ea_desktop::ea_desktop_is_running_sync(),
        _ => Err("apex.history.errors.invalidAccount".to_string()),
    }
}

fn ensure_launcher_stopped(launcher: &ApexLauncherRef) -> Result<(), String> {
    if launcher_is_running(launcher)? {
        Err("apex.history.errors.launcherRunning".to_string())
    } else {
        Ok(())
    }
}

#[cfg(windows)]
#[allow(clippy::permissions_set_readonly_false)]
fn make_permissions_writable(permissions: &mut fs::Permissions) {
    permissions.set_readonly(false);
}

#[cfg(unix)]
fn make_permissions_writable(permissions: &mut fs::Permissions) {
    use std::os::unix::fs::PermissionsExt;

    permissions.set_mode(permissions.mode() | 0o200);
}

#[cfg(not(any(windows, unix)))]
#[allow(clippy::permissions_set_readonly_false)]
fn make_permissions_writable(permissions: &mut fs::Permissions) {
    permissions.set_readonly(false);
}

fn clear_readonly(path: &Path) -> Result<(), String> {
    let mut permissions = fs::metadata(path)
        .map_err(|error| error.to_string())?
        .permissions();
    if permissions.readonly() {
        make_permissions_writable(&mut permissions);
        fs::set_permissions(path, permissions).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn remove_config_file(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    clear_readonly(path)?;
    fs::remove_file(path).map_err(|error| error.to_string())
}

/// 写入默认配置模板(覆盖现有文件或新建)。settings.cfg / profile.cfg /
/// videoconfig.txt 都直接写内置默认值;videoconfig 的分辨率由调用方按机器当前值填入。
fn write_default_config(path: &Path, content: &str) -> Result<(), String> {
    if path.exists() {
        clear_readonly(path)?;
    }
    atomic_write(path, content.as_bytes())?;
    let mut permissions = fs::metadata(path)
        .map_err(|error| error.to_string())?
        .permissions();
    #[allow(clippy::permissions_set_readonly_false)]
    permissions.set_readonly(false);
    fs::set_permissions(path, permissions).map_err(|error| error.to_string())
}

fn restore_file(file: &StoredFile, target: &Path) -> Result<(), String> {
    let bytes = verified_bytes(file)?;
    if !file.existed {
        return remove_config_file(target);
    }
    if target.exists() {
        clear_readonly(target)?;
    }
    atomic_write(target, &bytes)?;
    let mut permissions = fs::metadata(target)
        .map_err(|error| error.to_string())?
        .permissions();
    permissions.set_readonly(file.readonly);
    fs::set_permissions(target, permissions).map_err(|error| error.to_string())
}

fn reset_impl(
    app: &tauri::AppHandle,
    launcher: ApexLauncherRef,
) -> Result<ApexResetResult, String> {
    let _guard = lock_history()?;
    if apex::apex_is_running_sync()? {
        return Err("apex.history.errors.apexRunning".to_string());
    }
    ensure_launcher_stopped(&launcher)?;
    let dir = history_dir(app)?;
    let launch_options = read_launch(&launcher)?;
    let video_path = apex::apex_video_config_path()?;
    let (settings_path, profile_path) = apex_settings::apex_game_settings_paths()?;
    let video = capture_file(&video_path)?;
    let settings = capture_file(&settings_path)?;
    let profile = capture_file(&profile_path)?;
    if launch_options.is_empty() && !video.existed && !settings.existed && !profile.existed {
        return Err("apex.history.errors.noChanges".to_string());
    }
    let entry = record_locked(
        &dir,
        ApexHistorySource::Reset,
        None,
        RecordParts {
            launcher: Some(launcher.clone()),
            launch_options: Some(launch_options.clone()),
            video: Some(video.clone()),
            settings: Some(settings.clone()),
            profile: Some(profile.clone()),
        },
    )?;
    let result = (|| -> Result<(), String> {
        write_launch(&launcher, "")?;
        let video_bytes = if video.existed {
            verified_bytes(&video).ok()
        } else {
            None
        };
        let (width, height) =
            apex_defaults::resolution_from_videoconfig_bytes(video_bytes.as_deref().unwrap_or(&[]));
        write_default_config(
            &video_path,
            &apex_defaults::build_default_videoconfig(width, height),
        )?;
        write_default_config(&settings_path, apex_defaults::APEX_DEFAULT_SETTINGS_CFG)?;
        write_default_config(&profile_path, apex_defaults::APEX_DEFAULT_PROFILE_CFG)?;
        Ok(())
    })();
    if let Err(error) = result {
        let mut rollback_errors = Vec::new();
        collect_rollback_error(
            &mut rollback_errors,
            "launch",
            restore_launch_verified(&launcher, &launch_options),
        );
        collect_rollback_error(
            &mut rollback_errors,
            "video",
            restore_file_verified(&video, &video_path),
        );
        collect_rollback_error(
            &mut rollback_errors,
            "settings",
            restore_file_verified(&settings, &settings_path),
        );
        collect_rollback_error(
            &mut rollback_errors,
            "profile",
            restore_file_verified(&profile, &profile_path),
        );
        if rollback_errors.is_empty() {
            collect_rollback_error(
                &mut rollback_errors,
                "history cleanup",
                restore_history_entry_file(&entry_path(&dir, &entry.id)?, None),
            );
        }
        return Err(with_rollback_failure(error, rollback_errors));
    }
    let _ = prune_locked(&dir);
    Ok(ApexResetResult {
        history_entry: entry,
        pending_scopes: Vec::new(),
    })
}

fn rollback_game_files(
    game_paths: Option<&(PathBuf, PathBuf)>,
    settings: Option<&StoredFile>,
    profile: Option<&StoredFile>,
) -> Result<(), String> {
    let Some((settings_path, profile_path)) = game_paths else {
        return Ok(());
    };
    let mut errors = Vec::new();
    if let Some(file) = settings {
        collect_rollback_error(
            &mut errors,
            "settings",
            restore_file_verified(file, settings_path),
        );
    }
    if let Some(file) = profile {
        collect_rollback_error(
            &mut errors,
            "profile",
            restore_file_verified(file, profile_path),
        );
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

fn verify_stored_file(file: &StoredFile, target: &Path) -> Result<(), String> {
    if !file.existed {
        return match fs::metadata(target) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Ok(_) => Err(format!("{} still exists", target.display())),
            Err(error) => Err(format!("verify {} failed: {error}", target.display())),
        };
    }
    let expected = verified_bytes(file)?;
    let actual =
        fs::read(target).map_err(|error| format!("verify {} failed: {error}", target.display()))?;
    if actual != expected {
        return Err(format!("verify {} content mismatch", target.display()));
    }
    let readonly = fs::metadata(target)
        .map_err(|error| format!("verify {} failed: {error}", target.display()))?
        .permissions()
        .readonly();
    if readonly != file.readonly {
        return Err(format!("verify {} readonly mismatch", target.display()));
    }
    Ok(())
}

fn restore_file_verified(file: &StoredFile, target: &Path) -> Result<(), String> {
    let restore_error = restore_file(file, target).err();
    match verify_stored_file(file, target) {
        Ok(()) => Ok(()),
        Err(verify_error) => Err(match restore_error {
            Some(error) => format!("{error}; {verify_error}"),
            None => verify_error,
        }),
    }
}

fn restore_launch_verified(launcher: &ApexLauncherRef, value: &str) -> Result<(), String> {
    let restore_error = write_launch(launcher, value).err();
    match read_launch(launcher) {
        Ok(current) if current == value => Ok(()),
        Ok(_) => Err(match restore_error {
            Some(error) => format!("{error}; launch readback mismatch"),
            None => "launch readback mismatch".to_string(),
        }),
        Err(read_error) => Err(match restore_error {
            Some(error) => format!("{error}; {read_error}"),
            None => read_error,
        }),
    }
}

fn collect_rollback_error(errors: &mut Vec<String>, label: &str, result: Result<(), String>) {
    if let Err(error) = result {
        errors.push(format!("{label}: {error}"));
    }
}

fn with_rollback_failure(error: String, rollback_errors: Vec<String>) -> String {
    if rollback_errors.is_empty() {
        error
    } else {
        format!(
            "{error}; apex.history.errors.rollbackFailed: {}",
            rollback_errors.join("; ")
        )
    }
}

fn without_nested_rollback_failure(error: String) -> String {
    error
        .split_once("; apex.history.errors.rollbackFailed:")
        .map(|(message, _)| message.to_string())
        .unwrap_or(error)
}

fn restore_impl(
    app: &tauri::AppHandle,
    request: ApexHistoryRestoreRequest,
) -> Result<ApexHistoryRestoreResult, String> {
    let _guard = lock_history()?;
    let dir = history_dir(app)?;
    let target = load_entry_by_id(&dir, &request.entry_id)?;
    if let Some(value) = target.launch_options.as_deref() {
        apex::validate_launch_options(value)?;
    }
    if let Some(target_launcher) = &target.launcher {
        if !request
            .launcher
            .as_ref()
            .is_some_and(|launcher| same_launcher(launcher, target_launcher))
        {
            return Err("apex.history.errors.accountMismatch".to_string());
        }
        ensure_launcher_stopped(target_launcher)?;
    }
    if (target.video.is_some() || target.settings.is_some() || target.profile.is_some())
        && apex::apex_is_running_sync()?
    {
        return Err("apex.history.errors.apexRunning".to_string());
    }
    let video_path = target
        .video
        .as_ref()
        .map(|_| apex::apex_video_config_path())
        .transpose()?;
    let game_paths = if target.settings.is_some() || target.profile.is_some() {
        Some(apex_settings::apex_game_settings_paths()?)
    } else {
        None
    };
    if let Some(file) = &target.video {
        verified_bytes(file)?;
    }
    if let Some(file) = &target.settings {
        verified_bytes(file)?;
    }
    if let Some(file) = &target.profile {
        verified_bytes(file)?;
    }

    let current_launch = target.launcher.as_ref().map(read_launch).transpose()?;
    let current_video = video_path
        .as_ref()
        .map(|path| capture_file(path))
        .transpose()?;
    let current_settings = game_paths
        .as_ref()
        .and_then(|(settings, _)| target.settings.as_ref().map(|_| settings))
        .map(|path| capture_file(path))
        .transpose()?;
    let current_profile = game_paths
        .as_ref()
        .and_then(|(_, profile)| target.profile.as_ref().map(|_| profile))
        .map(|path| capture_file(path))
        .transpose()?;
    let undo = record_locked(
        &dir,
        ApexHistorySource::HistoryRestore,
        None,
        RecordParts {
            launcher: target.launcher.clone(),
            launch_options: current_launch.clone(),
            video: current_video.clone(),
            settings: current_settings.clone(),
            profile: current_profile.clone(),
        },
    )?;
    let mut restored_video_config = None;
    let mut restored_game_settings_report = None;
    let result = (|| -> Result<(), String> {
        if let (Some(launcher), Some(value)) = (&target.launcher, &target.launch_options) {
            write_launch(launcher, value)?;
        }
        if let (Some(file), Some(path)) = (&target.video, &video_path) {
            restore_file(file, path)?;
        }
        if let (Some((settings_path, profile_path)), Some(file)) = (&game_paths, &target.settings) {
            restore_file(file, settings_path)?;
            if let Some(profile) = &target.profile {
                restore_file(profile, profile_path)?;
            }
        } else if let (Some((_, profile_path)), Some(profile)) = (&game_paths, &target.profile) {
            restore_file(profile, profile_path)?;
        }
        if target.video.as_ref().is_some_and(|file| file.existed) {
            restored_video_config = Some(apex::read_video_config_sync()?);
        }
        if let Some((settings, profile)) = &game_paths {
            if settings.is_file() && profile.is_file() {
                restored_game_settings_report = Some(apex_settings::load_report()?);
            }
        }
        Ok(())
    })();
    if let Err(error) = result {
        let mut rollback_errors = Vec::new();
        if let (Some(launcher), Some(value)) = (&target.launcher, current_launch.as_deref()) {
            collect_rollback_error(
                &mut rollback_errors,
                "launch",
                restore_launch_verified(launcher, value),
            );
        }
        if let (Some(file), Some(path)) = (&current_video, &video_path) {
            collect_rollback_error(
                &mut rollback_errors,
                "video",
                restore_file_verified(file, path),
            );
        }
        collect_rollback_error(
            &mut rollback_errors,
            "game settings",
            rollback_game_files(
                game_paths.as_ref(),
                current_settings.as_ref(),
                current_profile.as_ref(),
            ),
        );
        if rollback_errors.is_empty() {
            collect_rollback_error(
                &mut rollback_errors,
                "history cleanup",
                restore_history_entry_file(&entry_path(&dir, &undo.id)?, None),
            );
        }
        return Err(with_rollback_failure(error, rollback_errors));
    }
    let mut pending_scopes = Vec::new();
    if target.video.as_ref().is_some_and(|file| !file.existed) {
        pending_scopes.push(ApexConfigScope::Video);
    }
    if target.settings.as_ref().is_some_and(|file| !file.existed)
        || target.profile.as_ref().is_some_and(|file| !file.existed)
    {
        pending_scopes.push(ApexConfigScope::GameSettings);
    }
    let _ = prune_locked(&dir);
    Ok(ApexHistoryRestoreResult {
        history_entry: undo,
        restored_scopes: target.scopes,
        pending_default_generation: !pending_scopes.is_empty(),
        pending_scopes,
        launch_options: target.launch_options,
        video_config: restored_video_config,
        game_settings_report: restored_game_settings_report,
    })
}

fn restore_history_entry_file(path: &Path, previous: Option<&[u8]>) -> Result<(), String> {
    if let Some(bytes) = previous {
        let write_error = atomic_write(path, bytes).err();
        match fs::read(path) {
            Ok(current) if current == bytes => Ok(()),
            Ok(_) => Err(match write_error {
                Some(error) => format!("{error}; history readback mismatch"),
                None => "history readback mismatch".to_string(),
            }),
            Err(read_error) => Err(match write_error {
                Some(error) => format!("{error}; {read_error}"),
                None => read_error.to_string(),
            }),
        }
    } else {
        match fs::metadata(path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
            Ok(_) => {
                let remove_error = fs::remove_file(path).err();
                match fs::metadata(path) {
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                    Ok(_) => Err(match remove_error {
                        Some(error) => format!("{error}; history entry still exists"),
                        None => "history entry still exists".to_string(),
                    }),
                    Err(error) => Err(match remove_error {
                        Some(remove_error) => format!("{remove_error}; {error}"),
                        None => error.to_string(),
                    }),
                }
            }
        }
    }
}

fn mutate_impl(
    app: &tauri::AppHandle,
    request: ApexConfigMutationRequest,
) -> Result<ApexConfigMutationResult, String> {
    if let Some(value) = request.launch_options.as_deref() {
        apex::validate_launch_options(value)?;
    }
    apex::validate_video_updates(&request.video_updates)?;
    let _guard = lock_history()?;

    let current_launch = match (&request.launcher, &request.launch_options) {
        (Some(launcher), Some(_)) => Some(read_launch(launcher)?),
        (None, Some(_)) => return Err("apex.history.errors.invalidAccount".to_string()),
        _ => None,
    };
    let launch_changed = request
        .launch_options
        .as_ref()
        .zip(current_launch.as_ref())
        .is_some_and(|(next, current)| next != current);

    let current_video_values = if request.video_updates.is_empty() {
        None
    } else {
        Some(apex::read_video_config_sync()?)
    };
    let video_changed = current_video_values.as_ref().is_some_and(|current| {
        request
            .video_updates
            .iter()
            .any(|(key, value)| current.get(key) != Some(value))
    });

    let game_changed = request.game_settings.as_ref().is_some_and(|game| {
        !game.settings_updates.is_empty()
            || !game.profile_updates.is_empty()
            || !game.binding_mutations.is_empty()
    });

    let mut changed_scopes = Vec::new();
    if launch_changed {
        changed_scopes.push(ApexConfigScope::Launch);
    }
    if video_changed {
        changed_scopes.push(ApexConfigScope::Video);
    }
    if game_changed {
        changed_scopes.push(ApexConfigScope::GameSettings);
    }
    if changed_scopes.is_empty() {
        return Ok(ApexConfigMutationResult {
            history_entry: None,
            changed_scopes,
            launch_options: request.launch_options,
            video_config: current_video_values,
            game_settings_report: None,
        });
    }

    if (video_changed || game_changed) && apex::apex_is_running_sync()? {
        return Err("apex.history.errors.apexRunning".to_string());
    }
    if launch_changed {
        ensure_launcher_stopped(
            request
                .launcher
                .as_ref()
                .ok_or_else(|| "apex.history.errors.invalidAccount".to_string())?,
        )?;
    }

    let video_path = video_changed
        .then(apex::apex_video_config_path)
        .transpose()?;
    let video_before = video_path
        .as_ref()
        .map(|path| capture_file(path))
        .transpose()?;
    let game_paths = game_changed
        .then(apex_settings::apex_game_settings_paths)
        .transpose()?;
    let settings_before = game_paths
        .as_ref()
        .map(|(path, _)| capture_file(path))
        .transpose()?;
    let profile_before = game_paths
        .as_ref()
        .map(|(_, path)| capture_file(path))
        .transpose()?;

    let transaction_id = resolve_transaction_id(request.transaction_id.as_deref());
    let dir = history_dir(app)?;
    if game_changed {
        import_legacy_locked(&dir)?;
    }
    let history_path = entry_path(&dir, &transaction_id)?;
    let previous_history = read_optional_file(&history_path)?;
    let history_entry = record_locked(
        &dir,
        request.source,
        Some(&transaction_id),
        RecordParts {
            launcher: launch_changed.then(|| request.launcher.clone()).flatten(),
            launch_options: launch_changed.then(|| current_launch.clone()).flatten(),
            video: video_before.clone(),
            settings: settings_before.clone(),
            profile: profile_before.clone(),
        },
    )?;

    let mut video_config = current_video_values.clone();
    let mut game_settings_report = None;
    let commit = (|| -> Result<(), String> {
        if launch_changed {
            write_launch(
                request
                    .launcher
                    .as_ref()
                    .ok_or_else(|| "apex.history.errors.invalidAccount".to_string())?,
                request
                    .launch_options
                    .as_deref()
                    .ok_or_else(|| "apex.history.errors.invalidAccount".to_string())?,
            )?;
        }
        if video_changed {
            apex::patch_video_config_sync(&request.video_updates)?;
            video_config = Some(apex::read_video_config_sync()?);
        }
        if game_changed {
            let game = request
                .game_settings
                .clone()
                .ok_or_else(|| "apex.gameSettings.errors.noChanges".to_string())?;
            game_settings_report = Some(apex_settings::apply_request_without_history(game)?);
        }
        Ok(())
    })();

    if let Err(error) = commit {
        let mut rollback_errors = Vec::new();
        if launch_changed {
            if let (Some(launcher), Some(value)) =
                (request.launcher.as_ref(), current_launch.as_deref())
            {
                collect_rollback_error(
                    &mut rollback_errors,
                    "launch",
                    restore_launch_verified(launcher, value),
                );
            }
        }
        if let (Some(file), Some(path)) = (&video_before, &video_path) {
            collect_rollback_error(
                &mut rollback_errors,
                "video",
                restore_file_verified(file, path),
            );
        }
        if let (Some(file), Some((settings_path, _))) = (&settings_before, &game_paths) {
            collect_rollback_error(
                &mut rollback_errors,
                "settings",
                restore_file_verified(file, settings_path),
            );
        }
        if let (Some(file), Some((_, profile_path))) = (&profile_before, &game_paths) {
            collect_rollback_error(
                &mut rollback_errors,
                "profile",
                restore_file_verified(file, profile_path),
            );
        }
        if rollback_errors.is_empty() {
            collect_rollback_error(
                &mut rollback_errors,
                "history",
                restore_history_entry_file(&history_path, previous_history.as_deref()),
            );
        }
        return Err(with_rollback_failure(
            without_nested_rollback_failure(error),
            rollback_errors,
        ));
    }

    let _ = prune_locked(&dir);
    Ok(ApexConfigMutationResult {
        history_entry: Some(history_entry),
        changed_scopes,
        launch_options: request.launch_options,
        video_config,
        game_settings_report,
    })
}

#[tauri::command]
pub async fn mutate_apex_config(
    app: tauri::AppHandle,
    request: ApexConfigMutationRequest,
) -> IpcResult<ApexConfigMutationResult> {
    blocking_cmd(move || mutate_impl(&app, request))
        .await
        .map_err(history_error)
}

#[tauri::command]
pub async fn list_apex_config_history(
    app: tauri::AppHandle,
) -> IpcResult<Vec<ApexConfigHistoryEntry>> {
    blocking_cmd(move || {
        let _guard = lock_history()?;
        let dir = history_dir(&app)?;
        import_legacy_locked(&dir)?;
        let mut entries = load_entries(&dir)?;
        entries.sort_by(|left, right| right.created_at.cmp(&left.created_at));
        Ok(entries.iter().map(summary).collect())
    })
    .await
    .map_err(history_error)
}

#[tauri::command]
pub async fn restore_apex_config_history(
    app: tauri::AppHandle,
    request: ApexHistoryRestoreRequest,
) -> IpcResult<ApexHistoryRestoreResult> {
    blocking_cmd(move || restore_impl(&app, request))
        .await
        .map_err(history_error)
}

#[tauri::command]
pub async fn reset_apex_to_game_defaults(
    app: tauri::AppHandle,
    launcher: ApexLauncherRef,
) -> IpcResult<ApexResetResult> {
    blocking_cmd(move || reset_impl(&app, launcher))
        .await
        .map_err(history_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    struct TestDir(PathBuf);

    impl TestDir {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(generated_id(&format!("mxtools-{label}")));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn launcher(kind: &str, id: &str) -> ApexLauncherRef {
        ApexLauncherRef {
            kind: kind.into(),
            id: id.into(),
            name: format!("{kind}-{id}"),
        }
    }

    fn stored_entry(
        id: String,
        created_at: String,
        scopes: Vec<ApexConfigScope>,
        launcher: Option<ApexLauncherRef>,
    ) -> StoredEntry {
        StoredEntry {
            schema_version: HISTORY_SCHEMA_VERSION,
            transaction_id: id.clone(),
            id,
            created_at,
            source: ApexHistorySource::Apply,
            launch_options: scopes.contains(&ApexConfigScope::Launch).then(String::new),
            video: scopes
                .contains(&ApexConfigScope::Video)
                .then(|| stored_file_for_bytes(Path::new("video"), Vec::new())),
            settings: scopes
                .contains(&ApexConfigScope::GameSettings)
                .then(|| stored_file_for_bytes(Path::new("settings"), Vec::new())),
            profile: scopes
                .contains(&ApexConfigScope::GameSettings)
                .then(|| stored_file_for_bytes(Path::new("profile"), Vec::new())),
            scopes,
            launcher,
        }
    }

    #[test]
    fn generated_ids_are_safe_for_file_names() {
        assert!(valid_id(&generated_id("apex")));
        assert!(!valid_id("../escape"));
        assert!(!valid_id("with space"));
    }

    #[test]
    fn stored_file_checksum_detects_tampering() {
        let mut file = stored_file_for_bytes(Path::new("settings.cfg"), b"test".to_vec());
        assert_eq!(verified_bytes(&file).unwrap(), b"test");
        file.content_base64 = BASE64.encode(b"changed");
        assert!(verified_bytes(&file).is_err());
    }

    #[test]
    fn stream_keys_scope_launch_history_by_account() {
        let entry = StoredEntry {
            schema_version: 1,
            id: "id".into(),
            transaction_id: "id".into(),
            created_at: DateTime::<Utc>::from(UNIX_EPOCH).to_rfc3339(),
            source: ApexHistorySource::Apply,
            scopes: vec![ApexConfigScope::Launch, ApexConfigScope::Video],
            launcher: Some(ApexLauncherRef {
                kind: "steam".into(),
                id: "42".into(),
                name: String::new(),
            }),
            launch_options: Some(String::new()),
            video: None,
            settings: None,
            profile: None,
        };
        assert_eq!(stream_keys(&entry), vec!["launch:steam:42", "video"]);
    }

    #[test]
    fn pruning_keeps_thirty_entries_per_stream_and_account() {
        let dir = TestDir::new("prune");
        for index in 0..31 {
            let entry = stored_entry(
                format!("steam-{index:02}"),
                format!("2026-01-01T00:00:{index:02}Z"),
                vec![ApexConfigScope::Launch],
                Some(launcher("steam", "1")),
            );
            save_entry(&dir.0, &entry).unwrap();
        }
        let ea = stored_entry(
            "ea-only".into(),
            "2026-01-01T00:01:00Z".into(),
            vec![ApexConfigScope::Launch],
            Some(launcher("ea", "2")),
        );
        save_entry(&dir.0, &ea).unwrap();

        prune_locked(&dir.0).unwrap();
        let entries = load_entries(&dir.0).unwrap();
        let steam_count = entries
            .iter()
            .filter(|entry| stream_keys(entry).contains(&"launch:steam:1".to_string()))
            .count();
        assert_eq!(steam_count, HISTORY_LIMIT_PER_STREAM);
        assert!(entries.iter().any(|entry| entry.id == "ea-only"));
        assert!(!entries.iter().any(|entry| entry.id == "steam-00"));
    }

    #[test]
    fn pruning_removes_only_the_expired_scope_from_shared_transactions() {
        let dir = TestDir::new("scope-prune");
        for index in 0..31 {
            let entry = stored_entry(
                format!("shared-{index:02}"),
                format!("2026-01-01T00:00:{index:02}Z"),
                vec![ApexConfigScope::Launch, ApexConfigScope::Video],
                Some(launcher("steam", "1")),
            );
            save_entry(&dir.0, &entry).unwrap();
        }
        for index in 0..30 {
            let entry = stored_entry(
                format!("video-{index:02}"),
                format!("2026-01-02T00:00:{index:02}Z"),
                vec![ApexConfigScope::Video],
                None,
            );
            save_entry(&dir.0, &entry).unwrap();
        }

        prune_locked(&dir.0).unwrap();
        let entries = load_entries(&dir.0).unwrap();
        let launch_count = entries
            .iter()
            .filter(|entry| entry.scopes.contains(&ApexConfigScope::Launch))
            .count();
        let video_count = entries
            .iter()
            .filter(|entry| entry.scopes.contains(&ApexConfigScope::Video))
            .count();
        assert_eq!(launch_count, HISTORY_LIMIT_PER_STREAM);
        assert_eq!(video_count, HISTORY_LIMIT_PER_STREAM);
        assert!(entries.iter().any(|entry| {
            entry.id == "shared-30" && entry.scopes == vec![ApexConfigScope::Launch]
        }));
    }

    #[test]
    fn exact_restore_preserves_bytes_absence_and_readonly_state() {
        let dir = TestDir::new("restore");
        let exact_path = dir.0.join("settings.cfg");
        let missing_path = dir.0.join("profile.cfg");
        let bytes = b"// comment\r\nunknown \"\xff\"\r\n";
        fs::write(&exact_path, bytes).unwrap();
        let mut permissions = fs::metadata(&exact_path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&exact_path, permissions).unwrap();
        let exact = capture_file(&exact_path).unwrap();
        let missing = capture_file(&missing_path).unwrap();

        remove_config_file(&exact_path).unwrap();
        fs::write(&missing_path, b"generated").unwrap();
        restore_file(&exact, &exact_path).unwrap();
        restore_file(&missing, &missing_path).unwrap();

        assert_eq!(fs::read(&exact_path).unwrap(), bytes);
        assert!(fs::metadata(&exact_path).unwrap().permissions().readonly());
        assert!(!missing_path.exists());
        clear_readonly(&exact_path).unwrap();
    }

    #[test]
    fn rollback_snapshots_restore_all_touched_files() {
        let dir = TestDir::new("rollback");
        let settings_path = dir.0.join("settings.cfg");
        let profile_path = dir.0.join("profile.cfg");
        fs::write(&settings_path, b"settings-before").unwrap();
        fs::write(&profile_path, b"profile-before").unwrap();
        let settings = capture_file(&settings_path).unwrap();
        let profile = capture_file(&profile_path).unwrap();
        fs::write(&settings_path, b"settings-after").unwrap();
        fs::remove_file(&profile_path).unwrap();

        restore_file(&settings, &settings_path).unwrap();
        restore_file(&profile, &profile_path).unwrap();
        assert_eq!(fs::read(&settings_path).unwrap(), b"settings-before");
        assert_eq!(fs::read(&profile_path).unwrap(), b"profile-before");
    }

    #[test]
    fn profile_only_rollback_restores_the_previous_profile() {
        let dir = TestDir::new("profile-only-rollback");
        let settings_path = dir.0.join("settings.cfg");
        let profile_path = dir.0.join("profile.cfg");
        fs::write(&profile_path, b"profile-before").unwrap();
        let profile = capture_file(&profile_path).unwrap();
        fs::write(&profile_path, b"profile-after").unwrap();

        rollback_game_files(
            Some(&(settings_path, profile_path.clone())),
            None,
            Some(&profile),
        )
        .unwrap();

        assert_eq!(fs::read(&profile_path).unwrap(), b"profile-before");
    }

    #[test]
    fn legacy_backups_import_once_and_remain_untouched() {
        let dir = TestDir::new("legacy");
        let history = dir.0.join("history");
        fs::create_dir_all(&history).unwrap();
        let settings_path = dir.0.join("settings.cfg");
        let profile_path = dir.0.join("profile.cfg");
        let settings_backup = legacy_backup_path(&settings_path);
        let profile_backup = legacy_backup_path(&profile_path);
        fs::write(&settings_backup, b"legacy-settings").unwrap();
        fs::write(&profile_backup, b"legacy-profile").unwrap();

        import_legacy_paths_locked(&history, &settings_path, &profile_path).unwrap();
        import_legacy_paths_locked(&history, &settings_path, &profile_path).unwrap();

        let entries = load_entries(&history).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].source, ApexHistorySource::LegacyBackup);
        assert_eq!(fs::read(&settings_backup).unwrap(), b"legacy-settings");
        assert_eq!(fs::read(&profile_backup).unwrap(), b"legacy-profile");
    }

    #[test]
    fn legacy_backup_marker_prevents_importing_later_internal_backups() {
        let dir = TestDir::new("legacy-marker");
        let history = dir.0.join("history");
        fs::create_dir_all(&history).unwrap();
        let settings_path = dir.0.join("settings.cfg");
        let profile_path = dir.0.join("profile.cfg");
        let settings_backup = legacy_backup_path(&settings_path);
        fs::write(&settings_backup, b"legacy-settings").unwrap();

        import_legacy_once_paths_locked(&history, &settings_path, &profile_path).unwrap();
        fs::write(&settings_backup, b"new-internal-backup").unwrap();
        import_legacy_once_paths_locked(&history, &settings_path, &profile_path).unwrap();

        let entries = load_entries(&history).unwrap();
        assert_eq!(entries.len(), 1);
        assert!(history.join(LEGACY_IMPORT_MARKER).is_file());
    }

    #[test]
    fn legacy_backup_read_errors_do_not_write_the_migration_marker() {
        let dir = TestDir::new("legacy-read-error");
        let history = dir.0.join("history");
        fs::create_dir_all(&history).unwrap();
        let settings_path = dir.0.join("settings.cfg");
        let profile_path = dir.0.join("profile.cfg");
        fs::create_dir_all(legacy_backup_path(&settings_path)).unwrap();

        let error =
            import_legacy_once_paths_locked(&history, &settings_path, &profile_path).unwrap_err();

        assert!(error.contains("readFailed"));
        assert!(!history.join(LEGACY_IMPORT_MARKER).exists());
    }

    #[test]
    fn repeated_scope_records_report_that_the_scope_already_existed() {
        let dir = TestDir::new("repeated-scope");
        let video_path = dir.0.join("videoconfig.txt");
        let parts = || RecordParts {
            launcher: None,
            launch_options: None,
            video: Some(stored_file_for_bytes(&video_path, b"before".to_vec())),
            settings: None,
            profile: None,
        };

        let first = record_scope_locked(
            &dir.0,
            ApexHistorySource::Apply,
            Some("shared-transaction"),
            ApexConfigScope::Video,
            parts(),
        )
        .unwrap();
        let second = record_scope_locked(
            &dir.0,
            ApexHistorySource::Apply,
            Some("shared-transaction"),
            ApexConfigScope::Video,
            parts(),
        )
        .unwrap();

        assert!(first.scope_added);
        assert!(!second.scope_added);
        assert_eq!(first.entry.id, second.entry.id);
    }

    #[test]
    fn mutation_lock_serializes_concurrent_writers() {
        let value = Arc::new(AtomicU64::new(0));
        let mut threads = Vec::new();
        for _ in 0..4 {
            let value = Arc::clone(&value);
            threads.push(std::thread::spawn(move || {
                for _ in 0..100 {
                    let _guard = lock_history().unwrap();
                    let next = value.load(Ordering::Relaxed) + 1;
                    value.store(next, Ordering::Relaxed);
                }
            }));
        }
        for thread in threads {
            thread.join().unwrap();
        }
        assert_eq!(value.load(Ordering::Relaxed), 400);
    }
}
