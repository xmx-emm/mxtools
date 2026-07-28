mod elevation;
mod native;
mod powershell;

use crate::ipc_error::{IpcError, IpcResult};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use tauri::Manager;
use winapi::um::errhandlingapi::GetLastError;
use winapi::um::winbase::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};

static ACL_STATE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSharingError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub win32_code: Option<u32>,
}

impl FolderSharingError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            win32_code: None,
        }
    }

    pub fn win32(code: impl Into<String>, win32_code: u32) -> Self {
        Self {
            code: code.into(),
            message: std::io::Error::from_raw_os_error(win32_code as i32).to_string(),
            win32_code: Some(win32_code),
        }
    }
}

impl From<std::io::Error> for FolderSharingError {
    fn from(value: std::io::Error) -> Self {
        Self::new("io_error", value.to_string())
    }
}

impl From<FolderSharingError> for IpcError {
    fn from(value: FolderSharingError) -> Self {
        let code = if value.code.starts_with("folder_sharing.") {
            value.code
        } else {
            format!("folder_sharing.{}", value.code)
        };
        let mut details = Map::new();
        if let Some(win32_code) = value.win32_code {
            details.insert("win32Code".to_string(), Value::from(win32_code));
        }
        IpcError {
            code,
            message: value.message,
            details: (!details.is_empty()).then_some(details),
        }
    }
}

impl std::fmt::Display for FolderSharingError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalShare {
    pub name: String,
    pub path: String,
    pub description: String,
    pub unc_path: String,
    pub current_users: u32,
    pub special: bool,
    pub temporary: bool,
    pub disk_share: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareAccount {
    pub account_name: String,
    pub display_name: String,
    pub sid: String,
    pub enabled: bool,
    pub source: String,
    pub password_required: bool,
    pub selectable: bool,
    pub well_known: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SharePermission {
    Read,
    Change,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharePrincipal {
    pub account_name: String,
    pub sid: String,
    pub permission: SharePermission,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareMutationRequest {
    pub original_name: Option<String>,
    pub name: String,
    pub path: String,
    pub description: String,
    pub principals: Vec<SharePrincipal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareAccessEntry {
    pub account_name: String,
    pub sid: String,
    pub access_right: String,
    pub access_control_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareAccessSummary {
    pub name: String,
    pub access: Vec<ShareAccessEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NtfsAclChange {
    pub account_name: String,
    pub sid: String,
    pub permission: SharePermission,
    pub required_rights: String,
    pub will_add: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NtfsAclPreview {
    pub path: String,
    pub before_sddl: String,
    pub after_sddl: Option<String>,
    pub changes: Vec<NtfsAclChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareDetails {
    pub share: LocalShare,
    pub access: Vec<ShareAccessEntry>,
    pub acl: NtfsAclPreview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareApplyResult {
    pub share: LocalShare,
    pub access: Vec<ShareAccessEntry>,
    pub acl: NtfsAclPreview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveShareResult {
    pub name: String,
    pub path: String,
    pub acl_cleaned: bool,
    pub acl_cleanup_skipped: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDevice {
    pub name: String,
    pub remote_name: String,
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteShare {
    pub name: String,
    pub description: String,
    pub unc_path: String,
    pub special: bool,
    pub disk_share: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MappedDrive {
    pub local_path: String,
    pub remote_path: String,
    pub provider: String,
    pub persistent: bool,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConnectionRequest {
    pub remote_path: String,
    pub local_path: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub persistent: bool,
    pub prompt: bool,
    pub save_credentials: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmbSession {
    pub session_id: String,
    pub client_computer_name: String,
    pub client_user_name: String,
    pub num_opens: u32,
    pub dialect: String,
    pub encrypted: bool,
    pub signed: bool,
    pub seconds_idle: u64,
    pub seconds_exists: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmbOpenFile {
    pub file_id: String,
    pub session_id: String,
    pub client_computer_name: String,
    pub client_user_name: String,
    pub path: String,
    pub share_relative_path: String,
    pub permissions: String,
    pub locks: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmbActivity {
    pub sessions: Vec<SmbSession>,
    pub open_files: Vec<SmbOpenFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Pass,
    Warning,
    Error,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareHealthCheck {
    pub id: String,
    pub status: HealthStatus,
    pub value: String,
    pub repair_action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProfile {
    pub interface_index: u32,
    pub name: String,
    pub category: String,
    pub ipv4_connectivity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareHealthReport {
    pub computer_name: String,
    pub addresses: Vec<String>,
    pub profiles: Vec<NetworkProfile>,
    pub checks: Vec<ShareHealthCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairResult {
    pub action: String,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupAclSnapshot {
    pub before_sddl: String,
    pub after_sddl: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareExecutionRequest {
    #[serde(flatten)]
    pub request: ShareMutationRequest,
    pub managed_acl: Option<CleanupAclSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "payload", rename_all = "snake_case")]
pub enum PrivilegedOperation {
    ApplyShare(ShareExecutionRequest),
    GetShareDetails {
        name: String,
    },
    GetShareAccessSummaries {
        names: Vec<String>,
    },
    RemoveShare {
        name: String,
        force: bool,
        cleanup_acl: Option<CleanupAclSnapshot>,
    },
    GetActivity,
    CloseSession {
        session_id: String,
    },
    CloseOpenFile {
        file_id: String,
    },
    Repair {
        actions: Vec<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "payload", rename_all = "snake_case")]
pub enum PrivilegedResult {
    ShareApplied(ShareApplyResult),
    ShareDetails(ShareDetails),
    ShareAccessSummaries(Vec<ShareAccessSummary>),
    ShareRemoved(RemoveShareResult),
    Activity(SmbActivity),
    Closed,
    Repairs(Vec<RepairResult>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ElevatedEnvelope {
    ok: bool,
    result: Option<PrivilegedResult>,
    error: Option<FolderSharingError>,
}

impl ElevatedEnvelope {
    fn from_result(result: Result<PrivilegedResult, FolderSharingError>) -> Self {
        match result {
            Ok(result) => Self {
                ok: true,
                result: Some(result),
                error: None,
            },
            Err(error) => Self {
                ok: false,
                result: None,
                error: Some(error),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedAclRecord {
    share_name: String,
    path: String,
    before_sddl: String,
    after_sddl: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedAclState {
    records: Vec<ManagedAclRecord>,
}

#[tauri::command(async)]
pub fn list_local_shares() -> IpcResult<Vec<LocalShare>> {
    native::list_local_shares().map_err(Into::into)
}

#[tauri::command(async)]
pub fn list_local_share_access() -> IpcResult<Vec<ShareAccessSummary>> {
    let names = native::list_local_shares()?
        .into_iter()
        .filter(|share| share.disk_share && !share.special)
        .map(|share| share.name)
        .collect::<Vec<_>>();
    if names.is_empty() {
        return Ok(Vec::new());
    }
    for name in &names {
        validate_existing_share_name(name)?;
    }
    match run_privileged(PrivilegedOperation::GetShareAccessSummaries { names })? {
        PrivilegedResult::ShareAccessSummaries(result) => Ok(result),
        _ => Err(FolderSharingError::new(
            "invalid_helper_response",
            "Unexpected elevated helper response",
        )
        .into()),
    }
}

#[tauri::command(async)]
pub fn list_share_accounts() -> IpcResult<Vec<ShareAccount>> {
    powershell::list_share_accounts().map_err(Into::into)
}

#[tauri::command(async)]
pub fn preview_local_share(
    app: tauri::AppHandle,
    request: ShareMutationRequest,
) -> IpcResult<NtfsAclPreview> {
    validate_share_request(&request)?;
    let managed_acl = managed_acl_for_request(&app, &request);
    powershell::preview_acl(&ShareExecutionRequest {
        request,
        managed_acl,
    })
    .map_err(Into::into)
}

#[tauri::command(async)]
pub fn apply_local_share(
    app: tauri::AppHandle,
    request: ShareMutationRequest,
) -> IpcResult<ShareApplyResult> {
    validate_share_request(&request)?;
    let _state_guard = lock_acl_state()?;
    let existing_state = load_acl_state(&app);
    let managed_acl = managed_acl_for_request_in_state(&existing_state, &request);
    let result = run_privileged(PrivilegedOperation::ApplyShare(ShareExecutionRequest {
        request: request.clone(),
        managed_acl,
    }))?;
    let PrivilegedResult::ShareApplied(result) = result else {
        return Err(FolderSharingError::new(
            "invalid_helper_response",
            "Unexpected elevated helper response",
        )
        .into());
    };

    if let Some(after_sddl) = result.acl.after_sddl.clone() {
        let mut state = existing_state;
        state.records.retain(|record| {
            !record.share_name.eq_ignore_ascii_case(
                request
                    .original_name
                    .as_deref()
                    .unwrap_or(request.name.as_str()),
            )
        });
        state.records.push(ManagedAclRecord {
            share_name: result.share.name.clone(),
            path: result.share.path.clone(),
            before_sddl: result.acl.before_sddl.clone(),
            after_sddl,
        });
        save_acl_state(&app, &state)?;
    }
    Ok(result)
}

#[tauri::command(async)]
pub fn get_local_share_details(name: String) -> IpcResult<ShareDetails> {
    validate_existing_share_name(&name)?;
    match run_privileged(PrivilegedOperation::GetShareDetails { name })? {
        PrivilegedResult::ShareDetails(result) => Ok(result),
        _ => Err(FolderSharingError::new(
            "invalid_helper_response",
            "Unexpected elevated helper response",
        )
        .into()),
    }
}

#[tauri::command(async)]
pub fn remove_local_share(
    app: tauri::AppHandle,
    name: String,
    force: bool,
    cleanup_ntfs: bool,
) -> IpcResult<RemoveShareResult> {
    validate_existing_share_name(&name)?;
    if is_protected_share(&name) {
        return Err(FolderSharingError::new(
            "protected_share",
            "System-managed shares cannot be removed",
        )
        .into());
    }
    let _state_guard = lock_acl_state()?;
    let mut state = load_acl_state(&app);
    let record = state
        .records
        .iter()
        .find(|record| record.share_name.eq_ignore_ascii_case(&name))
        .cloned();
    let cleanup_acl = if cleanup_ntfs {
        record.as_ref().and_then(|record| {
            let shared_path_count = state
                .records
                .iter()
                .filter(|other| other.path.eq_ignore_ascii_case(&record.path))
                .count();
            (shared_path_count == 1).then(|| CleanupAclSnapshot {
                before_sddl: record.before_sddl.clone(),
                after_sddl: record.after_sddl.clone(),
            })
        })
    } else {
        None
    };
    let result = run_privileged(PrivilegedOperation::RemoveShare {
        name: name.clone(),
        force,
        cleanup_acl,
    })?;
    let PrivilegedResult::ShareRemoved(result) = result else {
        return Err(FolderSharingError::new(
            "invalid_helper_response",
            "Unexpected elevated helper response",
        )
        .into());
    };
    state
        .records
        .retain(|record| !record.share_name.eq_ignore_ascii_case(&name));
    save_acl_state(&app, &state)?;
    Ok(result)
}

#[tauri::command(async)]
pub fn discover_network_devices() -> IpcResult<Vec<NetworkDevice>> {
    native::discover_network_devices().map_err(Into::into)
}

#[tauri::command(async)]
pub fn list_remote_shares(server: String) -> IpcResult<Vec<RemoteShare>> {
    native::list_remote_shares(&server).map_err(Into::into)
}

#[tauri::command(async)]
pub fn list_mapped_drives() -> IpcResult<Vec<MappedDrive>> {
    native::list_mapped_drives().map_err(Into::into)
}

#[tauri::command(async)]
pub fn open_shared_folder(path: String) -> IpcResult<()> {
    native::open_shared_folder(&path).map_err(Into::into)
}

#[tauri::command(async)]
pub fn connect_remote_share(request: RemoteConnectionRequest) -> IpcResult<MappedDrive> {
    native::connect_remote(request).map_err(Into::into)
}

#[tauri::command(async)]
pub fn disconnect_remote_share(
    name: String,
    remote_path: String,
    forget_persistent: bool,
    force: bool,
    forget_credentials: bool,
) -> IpcResult<()> {
    native::disconnect_remote(
        &name,
        Some(&remote_path),
        forget_persistent,
        force,
        forget_credentials,
    )
    .map_err(Into::into)
}

#[tauri::command(async)]
pub fn disconnect_remote_server(
    server: String,
    force: bool,
    forget_credentials: bool,
) -> IpcResult<u32> {
    native::disconnect_server(&server, force, forget_credentials).map_err(Into::into)
}

#[tauri::command(async)]
pub fn get_smb_activity() -> IpcResult<SmbActivity> {
    match run_privileged(PrivilegedOperation::GetActivity)? {
        PrivilegedResult::Activity(result) => Ok(result),
        _ => Err(FolderSharingError::new(
            "invalid_helper_response",
            "Unexpected elevated helper response",
        )
        .into()),
    }
}

#[tauri::command(async)]
pub fn close_smb_session(session_id: String) -> IpcResult<()> {
    validate_numeric_id(&session_id)?;
    match run_privileged(PrivilegedOperation::CloseSession { session_id })? {
        PrivilegedResult::Closed => Ok(()),
        _ => Err(FolderSharingError::new(
            "invalid_helper_response",
            "Unexpected elevated helper response",
        )
        .into()),
    }
}

#[tauri::command(async)]
pub fn close_smb_open_file(file_id: String) -> IpcResult<()> {
    validate_numeric_id(&file_id)?;
    match run_privileged(PrivilegedOperation::CloseOpenFile { file_id })? {
        PrivilegedResult::Closed => Ok(()),
        _ => Err(FolderSharingError::new(
            "invalid_helper_response",
            "Unexpected elevated helper response",
        )
        .into()),
    }
}

#[tauri::command(async)]
pub fn scan_folder_sharing_health() -> IpcResult<ShareHealthReport> {
    powershell::scan_health().map_err(Into::into)
}

#[tauri::command(async)]
pub fn repair_folder_sharing(
    actions: Vec<String>,
    confirm_public_profile_change: bool,
) -> IpcResult<Vec<RepairResult>> {
    validate_repair_actions(&actions, confirm_public_profile_change)?;
    match run_privileged(PrivilegedOperation::Repair { actions })? {
        PrivilegedResult::Repairs(result) => Ok(result),
        _ => Err(FolderSharingError::new(
            "invalid_helper_response",
            "Unexpected elevated helper response",
        )
        .into()),
    }
}

pub fn try_run_elevated_helper() -> Option<i32> {
    elevation::try_run_helper(|operation| {
        ElevatedEnvelope::from_result(powershell::execute_privileged(operation))
    })
}

fn run_privileged(operation: PrivilegedOperation) -> Result<PrivilegedResult, FolderSharingError> {
    if crate::elevated::is_elevated() {
        return powershell::execute_privileged(operation);
    }
    let envelope: ElevatedEnvelope = elevation::run_elevated(operation)?;
    if envelope.ok {
        envelope.result.ok_or_else(|| {
            FolderSharingError::new(
                "invalid_helper_response",
                "Elevated helper returned no result",
            )
        })
    } else {
        Err(envelope.error.unwrap_or_else(|| {
            FolderSharingError::new(
                "elevated_operation_failed",
                "Elevated helper failed without an error",
            )
        }))
    }
}

fn validate_share_request(request: &ShareMutationRequest) -> Result<(), FolderSharingError> {
    validate_share_name(&request.name)?;
    if let Some(original_name) = request.original_name.as_deref() {
        validate_existing_share_name(original_name)?;
        if !original_name.eq_ignore_ascii_case(&request.name) {
            return Err(FolderSharingError::new(
                "share_rename_not_supported",
                "Stop and recreate a share to change its name",
            ));
        }
    }
    let raw_path = request.path.trim();
    let path = Path::new(raw_path);
    if raw_path.starts_with(r"\\") || !path.is_absolute() || !path.is_dir() {
        return Err(FolderSharingError::new(
            "invalid_share_path",
            "Share path must be an existing local directory",
        ));
    }
    if request.description.contains('\0') || request.description.len() > 256 {
        return Err(FolderSharingError::new(
            "invalid_description",
            "Description is invalid or too long",
        ));
    }
    if request.principals.is_empty() {
        return Err(FolderSharingError::new(
            "principal_required",
            "Select at least one account",
        ));
    }
    let mut seen_sids = HashMap::new();
    for principal in &request.principals {
        if principal.account_name.trim().is_empty()
            || principal.account_name.len() > 256
            || principal.account_name.contains(['\0', '\r', '\n'])
            || principal.sid.trim().is_empty()
        {
            return Err(FolderSharingError::new(
                "invalid_principal",
                "Invalid share principal",
            ));
        }
        let sid = principal.sid.trim().to_ascii_uppercase();
        if !is_valid_sid(&sid) {
            return Err(FolderSharingError::new(
                "invalid_principal",
                "Invalid account SID",
            ));
        }
        let rid = sid.rsplit('-').next().unwrap_or_default();
        if matches!(
            sid.as_str(),
            "S-1-1-0" | "S-1-5-7" | "S-1-5-18" | "S-1-5-19" | "S-1-5-20" | "S-1-5-32-544"
        ) || rid == "501"
            || principal.account_name.eq_ignore_ascii_case("guest")
            || principal.account_name.eq_ignore_ascii_case("everyone")
        {
            return Err(FolderSharingError::new(
                "unsafe_principal",
                "Guest and anonymous principals are not supported",
            ));
        }
        if seen_sids.insert(sid, true).is_some() {
            return Err(FolderSharingError::new(
                "duplicate_principal",
                "The same account was selected more than once",
            ));
        }
    }
    Ok(())
}

fn is_valid_sid(value: &str) -> bool {
    let mut parts = value.split('-');
    matches!(parts.next(), Some("S"))
        && parts.next().is_some_and(|part| part == "1")
        && parts
            .next()
            .is_some_and(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
        && {
            let authorities: Vec<_> = parts.collect();
            !authorities.is_empty()
                && authorities.iter().all(|part| {
                    !part.is_empty() && part.len() <= 10 && part.chars().all(|c| c.is_ascii_digit())
                })
        }
}

fn validate_share_name(name: &str) -> Result<(), FolderSharingError> {
    let name = name.trim();
    if name.is_empty()
        || name.len() > 80
        || name.ends_with('$')
        || name.chars().any(|c| {
            c.is_control()
                || matches!(
                    c,
                    '"' | '/'
                        | '\\'
                        | '['
                        | ']'
                        | ':'
                        | '|'
                        | '<'
                        | '>'
                        | '+'
                        | '='
                        | ';'
                        | ','
                        | '?'
                        | '*'
                )
        })
        || is_protected_share(name)
    {
        return Err(FolderSharingError::new(
            "invalid_share_name",
            "Invalid or reserved share name",
        ));
    }
    Ok(())
}

fn validate_existing_share_name(name: &str) -> Result<(), FolderSharingError> {
    let name = name.trim();
    if name.is_empty()
        || name.len() > 80
        || name
            .chars()
            .any(|c| c.is_control() || matches!(c, '"' | '/' | '\\'))
    {
        return Err(FolderSharingError::new(
            "invalid_share_name",
            "Invalid share name",
        ));
    }
    Ok(())
}

fn is_protected_share(name: &str) -> bool {
    let upper = name.trim().to_ascii_uppercase();
    matches!(upper.as_str(), "ADMIN$" | "IPC$" | "PRINT$" | "FAX$")
        || (upper.len() == 2 && upper.ends_with('$') && upper.as_bytes()[0].is_ascii_alphabetic())
}

fn validate_numeric_id(value: &str) -> Result<(), FolderSharingError> {
    if value.is_empty() || !value.chars().all(|c| c.is_ascii_digit()) {
        return Err(FolderSharingError::new(
            "invalid_id",
            "Invalid SMB identifier",
        ));
    }
    Ok(())
}

fn validate_repair_actions(
    actions: &[String],
    confirm_public_profile_change: bool,
) -> Result<(), FolderSharingError> {
    if actions.is_empty() || actions.len() > 16 {
        return Err(FolderSharingError::new(
            "invalid_repair_actions",
            "Select at least one valid repair",
        ));
    }
    for action in actions {
        let allowed = matches!(
            action.as_str(),
            "start_lanman_server"
                | "start_fdphost"
                | "start_fdrespub"
                | "start_ssdp"
                | "start_upnp"
                | "enable_private_file_sharing"
                | "enable_private_discovery"
                | "enable_smb2"
        ) || action
            .strip_prefix("set_profile_private:")
            .is_some_and(|index| !index.is_empty() && index.chars().all(|c| c.is_ascii_digit()));
        if !allowed {
            return Err(FolderSharingError::new(
                "unsafe_repair_action",
                format!("Unsupported repair action: {action}"),
            ));
        }
        if action.starts_with("set_profile_private:") && !confirm_public_profile_change {
            return Err(FolderSharingError::new(
                "public_profile_confirmation_required",
                "Changing a public network to private requires separate confirmation",
            ));
        }
    }
    Ok(())
}

fn managed_acl_for_request(
    app: &tauri::AppHandle,
    request: &ShareMutationRequest,
) -> Option<CleanupAclSnapshot> {
    managed_acl_for_request_in_state(&load_acl_state(app), request)
}

fn managed_acl_for_request_in_state(
    state: &ManagedAclState,
    request: &ShareMutationRequest,
) -> Option<CleanupAclSnapshot> {
    let original_name = request.original_name.as_deref()?;
    state
        .records
        .iter()
        .find(|record| {
            record.share_name.eq_ignore_ascii_case(original_name)
                && record.path.eq_ignore_ascii_case(request.path.trim())
        })
        .map(|record| CleanupAclSnapshot {
            before_sddl: record.before_sddl.clone(),
            after_sddl: record.after_sddl.clone(),
        })
}

fn acl_state_path(app: &tauri::AppHandle) -> Result<PathBuf, FolderSharingError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| FolderSharingError::new("app_data_unavailable", error.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("folder-sharing-acl.json"))
}

fn lock_acl_state() -> Result<MutexGuard<'static, ()>, FolderSharingError> {
    ACL_STATE_LOCK.lock().map_err(|_| {
        FolderSharingError::new(
            "metadata_lock_failed",
            "Folder sharing metadata lock is poisoned",
        )
    })
}

fn load_acl_state(app: &tauri::AppHandle) -> ManagedAclState {
    let Ok(path) = acl_state_path(app) else {
        return ManagedAclState::default();
    };
    let Ok(content) = fs::read_to_string(path) else {
        return ManagedAclState::default();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn save_acl_state(
    app: &tauri::AppHandle,
    state: &ManagedAclState,
) -> Result<(), FolderSharingError> {
    let path = acl_state_path(app)?;
    let temp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(state)
        .map_err(|error| FolderSharingError::new("metadata_serialize_failed", error.to_string()))?;
    fs::write(&temp, bytes)?;
    let result = replace_file(&temp, &path);
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn replace_file(source: &Path, destination: &Path) -> Result<(), FolderSharingError> {
    let source: Vec<u16> = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let replaced = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if replaced == 0 {
        Err(FolderSharingError::win32("metadata_write_failed", unsafe {
            GetLastError()
        }))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_request() -> ShareMutationRequest {
        ShareMutationRequest {
            original_name: None,
            name: "Games".into(),
            path: std::env::temp_dir().to_string_lossy().into_owned(),
            description: String::new(),
            principals: vec![SharePrincipal {
                account_name: "PC\\player".into(),
                sid: "S-1-5-21-1-2-3-1001".into(),
                permission: SharePermission::Read,
            }],
        }
    }

    #[test]
    fn protects_administrative_shares() {
        assert!(is_protected_share("C$"));
        assert!(is_protected_share("admin$"));
        assert!(is_protected_share("IPC$"));
        assert!(!is_protected_share("Media"));
    }

    #[test]
    fn rejects_hidden_and_reserved_new_share_names() {
        assert!(validate_share_name("private$").is_err());
        assert!(validate_share_name("bad/name").is_err());
        assert!(validate_share_name("Media").is_ok());
    }

    #[test]
    fn rejects_guest_and_everyone_principals() {
        let mut request = valid_request();
        request.principals[0].sid = "S-1-1-0".into();
        assert_eq!(
            validate_share_request(&request).unwrap_err().code,
            "unsafe_principal"
        );
    }

    #[test]
    fn validates_repair_allowlist() {
        assert!(validate_repair_actions(&["enable_smb2".into()], false).is_ok());
        assert!(validate_repair_actions(&["set_profile_private:12".into()], true).is_ok());
        assert_eq!(
            validate_repair_actions(&["set_profile_private:12".into()], false)
                .unwrap_err()
                .code,
            "public_profile_confirmation_required"
        );
        assert!(validate_repair_actions(&["disable_signing".into()], false).is_err());
    }

    #[test]
    fn validates_sids_and_rejects_privileged_builtins() {
        assert!(is_valid_sid("S-1-5-21-1-2-3-1001"));
        assert!(!is_valid_sid("S-1-5-not-a-sid"));
        let mut request = valid_request();
        request.principals[0].sid = "S-1-5-32-544".into();
        assert_eq!(
            validate_share_request(&request).unwrap_err().code,
            "unsafe_principal"
        );
    }

    #[test]
    fn replaces_existing_acl_metadata_file() {
        let root = std::env::temp_dir().join(format!(
            "mxtools-acl-state-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let source = root.join("state.tmp");
        let destination = root.join("state.json");
        let outcome = (|| -> Result<(String, bool), FolderSharingError> {
            fs::create_dir_all(&root)?;
            fs::write(&destination, b"old")?;
            fs::write(&source, b"new")?;
            replace_file(&source, &destination)?;
            Ok((fs::read_to_string(&destination)?, source.exists()))
        })();
        let _ = fs::remove_dir_all(&root);

        let (content, source_exists) = outcome.unwrap();
        assert_eq!(content, "new");
        assert!(!source_exists);
    }
}
