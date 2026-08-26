use crate::ipc_error::{IpcError, IpcResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::{Manager, Runtime};

const REPORT_LENGTH: usize = 91;
const RAZER_VENDOR_ID: u16 = 0x1532;
const FEATURE_USAGE_PAGE: u16 = 0x000c;
const FEATURE_USAGE: u16 = 0x0001;
const PROFILE: u8 = 1;
const COMMAND_GET_POLLING_RATE: u8 = 0xc0;
const COMMAND_SET_POLLING_RATE: u8 = 0x40;
const RESPONSE_READ_ATTEMPTS: usize = 12;
const RESPONSE_INITIAL_DELAY_MS: u64 = 10;
const RESPONSE_RETRY_DELAY_MS: u64 = 15;
const CONFIG_SCHEMA_VERSION: u32 = 1;
const JOURNAL_SCHEMA_VERSION: u32 = 1;
const SUPPORTED_RATES: [u32; 7] = [125, 250, 500, 1000, 2000, 4000, 8000];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RazerPollingDevice {
    pub device_id: String,
    pub identity_persistent: bool,
    pub name: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub connection: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RazerPollingStatus {
    pub available: bool,
    pub device: RazerPollingDevice,
    pub current_rate_hz: Option<u32>,
    pub baseline_rate_hz: Option<u32>,
    pub supported_rates_hz: Vec<u32>,
    pub candidate_rates_hz: Vec<u32>,
    pub busy: bool,
    pub faulted: bool,
    pub possibly_changed: bool,
    pub last_error: Option<String>,
    pub auto_enabled: bool,
    pub auto_target_rate_hz: Option<u32>,
    pub active_profile_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RazerPollingApplyResult {
    pub device_id: String,
    pub changed: bool,
    pub requested_rate_hz: u32,
    pub previous_rate_hz: u32,
    pub current_rate_hz: u32,
    pub restored: bool,
    pub possibly_changed: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RazerPollingProfile {
    pub profile_id: String,
    pub display_name: String,
    #[serde(default)]
    pub executable_paths: Vec<String>,
    #[serde(default)]
    pub package_family_names: Vec<String>,
    pub rate_hz: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RazerPollingDeviceConfig {
    pub device_id: String,
    pub idle_rate_hz: u32,
    #[serde(default)]
    pub profiles: Vec<RazerPollingProfile>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RazerPollingConfig {
    pub schema_version: u32,
    pub enabled: bool,
    #[serde(default)]
    pub devices: Vec<RazerPollingDeviceConfig>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RazerPollingCapabilityResult {
    pub device_id: String,
    pub original_rate_hz: Option<u32>,
    pub supported_rates_hz: Vec<u32>,
    pub highest_confirmed_rate_hz: Option<u32>,
    pub restored_rate_hz: Option<u32>,
    pub complete: bool,
    pub stopped_reason: Option<String>,
    pub faulted: bool,
    pub possibly_changed: bool,
}

#[derive(Clone, Debug, Default)]
struct ProtocolState {
    transaction: u8,
}

#[derive(Clone, Debug, Default)]
struct DeviceRuntime {
    connected: bool,
    current_rate_hz: Option<u32>,
    baseline_rate_hz: Option<u32>,
    last_confirmed_rate_hz: Option<u32>,
    confirmed_supported_rates_hz: BTreeSet<u32>,
    faulted: bool,
    possibly_changed: bool,
    last_error: Option<String>,
    auto_target_rate_hz: Option<u32>,
    active_profile_id: Option<String>,
}

struct DeviceSlot {
    info: Mutex<RazerPollingDevice>,
    protocol: Mutex<ProtocolState>,
    runtime: Mutex<DeviceRuntime>,
    operation: Mutex<()>,
    busy: AtomicBool,
}

impl DeviceSlot {
    fn new(info: RazerPollingDevice, recovery: Option<&RecoveryEntry>) -> Self {
        let mut runtime = DeviceRuntime {
            connected: true,
            ..DeviceRuntime::default()
        };
        if let Some(entry) = recovery {
            runtime.baseline_rate_hz = Some(entry.baseline_rate_hz);
            runtime.last_confirmed_rate_hz = Some(entry.last_confirmed_rate_hz);
            runtime.faulted = entry.possibly_changed;
            runtime.possibly_changed = entry.possibly_changed;
            if entry.possibly_changed {
                runtime.last_error = Some("razer_polling.recovery_required".into());
            }
        }
        Self {
            info: Mutex::new(info),
            protocol: Mutex::new(ProtocolState::default()),
            runtime: Mutex::new(runtime),
            operation: Mutex::new(()),
            busy: AtomicBool::new(false),
        }
    }
}

#[derive(Default)]
struct ControllerState {
    devices: HashMap<String, Arc<DeviceSlot>>,
    auto_config: Option<RazerPollingConfig>,
}

static CONTROLLER: OnceLock<Mutex<ControllerState>> = OnceLock::new();

fn controller() -> &'static Mutex<ControllerState> {
    CONTROLLER.get_or_init(|| Mutex::new(ControllerState::default()))
}

fn error(reason: &str, message: impl Into<String>) -> IpcError {
    IpcError::new(format!("razer_polling.{reason}"), message)
}

fn lock<'a, T>(mutex: &'a Mutex<T>) -> IpcResult<MutexGuard<'a, T>> {
    mutex
        .lock()
        .map_err(|_| error("state_poisoned", "Razer polling state is unavailable"))
}

fn opaque_device_id(identity: &str) -> String {
    let digest = Sha256::digest(identity.as_bytes());
    format!("rzr-{}", hex::encode(&digest[..12]))
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct SelectedDeviceIdentity {
    material: String,
    persistent: bool,
}

fn normalized_identity_value(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_uppercase)
}

fn select_device_identity(
    vendor_id: u16,
    product_id: u16,
    serial: Option<&str>,
    container_id: Option<&str>,
    instance_id: Option<&str>,
    hid_path: &str,
) -> SelectedDeviceIdentity {
    let (source, value, persistent) = if let Some(value) = normalized_identity_value(serial) {
        ("serial", value, true)
    } else if let Some(value) = normalized_identity_value(container_id) {
        ("container", value, true)
    } else if let Some(value) = normalized_identity_value(instance_id) {
        ("instance", value, true)
    } else {
        ("path", hid_path.trim().to_ascii_uppercase(), false)
    };
    SelectedDeviceIdentity {
        material: format!("{source}:{vendor_id:04x}:{product_id:04x}:{value}"),
        persistent,
    }
}

fn resolve_duplicate_device_id(
    primary_device_id: &str,
    primary_persistent: bool,
    path_fallback_device_id: &str,
    duplicate_count: usize,
) -> (String, bool) {
    if duplicate_count > 1 {
        (path_fallback_device_id.to_string(), false)
    } else {
        (primary_device_id.to_string(), primary_persistent)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryEntry {
    device_id: String,
    identity_persistent: bool,
    vendor_id: u16,
    product_id: u16,
    baseline_rate_hz: u32,
    last_confirmed_rate_hz: u32,
    intended_rate_hz: Option<u32>,
    possibly_changed: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryJournal {
    schema_version: u32,
    devices: BTreeMap<String, RecoveryEntry>,
}

impl Default for RecoveryJournal {
    fn default() -> Self {
        Self {
            schema_version: JOURNAL_SCHEMA_VERSION,
            devices: BTreeMap::new(),
        }
    }
}

trait RecoveryJournalStore: Send + Sync {
    fn load(&self) -> IpcResult<RecoveryJournal>;
    fn save(&self, journal: &RecoveryJournal) -> IpcResult<()>;
}

struct FileRecoveryJournalStore {
    path: PathBuf,
}

impl FileRecoveryJournalStore {
    fn new(path: PathBuf) -> Self {
        Self { path }
    }
}

impl RecoveryJournalStore for FileRecoveryJournalStore {
    fn load(&self) -> IpcResult<RecoveryJournal> {
        let bytes = match fs::read(&self.path) {
            Ok(bytes) => bytes,
            Err(io_error) if io_error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(RecoveryJournal::default())
            }
            Err(io_error) => {
                return Err(error(
                    "journal_read_failed",
                    format!("Could not read Razer recovery journal: {io_error}"),
                ))
            }
        };
        let journal: RecoveryJournal = serde_json::from_slice(&bytes).map_err(|json_error| {
            error(
                "journal_invalid",
                format!("Razer recovery journal is invalid: {json_error}"),
            )
        })?;
        if journal.schema_version != JOURNAL_SCHEMA_VERSION {
            return Err(error(
                "journal_version_unsupported",
                format!(
                    "Unsupported Razer recovery journal version: {}",
                    journal.schema_version
                ),
            ));
        }
        Ok(journal)
    }

    fn save(&self, journal: &RecoveryJournal) -> IpcResult<()> {
        let parent = self.path.parent().ok_or_else(|| {
            error(
                "journal_path_invalid",
                "Razer recovery journal path has no parent directory",
            )
        })?;
        fs::create_dir_all(parent).map_err(|io_error| {
            error(
                "journal_write_failed",
                format!("Could not create Razer recovery directory: {io_error}"),
            )
        })?;
        let bytes = serde_json::to_vec_pretty(journal).map_err(|json_error| {
            error(
                "journal_write_failed",
                format!("Could not serialize Razer recovery journal: {json_error}"),
            )
        })?;
        let file_name = self
            .path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("razer-polling-recovery.json");
        let temporary = self
            .path
            .with_file_name(format!(".{file_name}.{}.tmp", std::process::id()));
        let write_result = (|| -> std::io::Result<()> {
            let mut file = OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(&temporary)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            atomic_replace(&temporary, &self.path)
        })();
        if let Err(io_error) = write_result {
            let _ = fs::remove_file(&temporary);
            return Err(error(
                "journal_write_failed",
                format!("Could not commit Razer recovery journal: {io_error}"),
            ));
        }
        Ok(())
    }
}

#[cfg(windows)]
fn atomic_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::winbase::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};

    let source = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    if unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(not(windows))]
fn atomic_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[derive(Default)]
struct JournalManager {
    store: Option<Arc<dyn RecoveryJournalStore>>,
    journal: RecoveryJournal,
}

static RECOVERY_JOURNAL: OnceLock<Mutex<JournalManager>> = OnceLock::new();

fn journal_manager() -> &'static Mutex<JournalManager> {
    RECOVERY_JOURNAL.get_or_init(|| Mutex::new(JournalManager::default()))
}

fn ensure_recovery_journal<R: Runtime>(app: &tauri::AppHandle<R>) -> IpcResult<()> {
    let mut manager = lock(journal_manager())?;
    if manager.store.is_some() {
        return Ok(());
    }
    let app_data_dir = app.path().app_data_dir().map_err(|path_error| {
        error(
            "journal_path_failed",
            format!("Could not resolve app data directory: {path_error}"),
        )
    })?;
    let store: Arc<dyn RecoveryJournalStore> = Arc::new(FileRecoveryJournalStore::new(
        app_data_dir.join("razer-polling-recovery.json"),
    ));
    let journal = store.load()?;
    manager.store = Some(store);
    manager.journal = journal;
    drop(manager);
    hydrate_slots_from_journal()
}

fn hydrate_slots_from_journal() -> IpcResult<()> {
    let entries = lock(journal_manager())?.journal.devices.clone();
    let slots = lock(controller())?.devices.clone();
    for (device_id, slot) in slots {
        let Some(entry) = entries.get(&device_id) else {
            continue;
        };
        let mut runtime = lock(&slot.runtime)?;
        if runtime.baseline_rate_hz.is_none() {
            runtime.baseline_rate_hz = Some(entry.baseline_rate_hz);
            runtime.last_confirmed_rate_hz = Some(entry.last_confirmed_rate_hz);
            runtime.faulted = entry.possibly_changed;
            runtime.possibly_changed = entry.possibly_changed;
            if entry.possibly_changed {
                runtime.last_error = Some("razer_polling.recovery_required".into());
            }
        }
    }
    Ok(())
}

trait RecoveryRecorder {
    fn entry(&self, device_id: &str) -> IpcResult<Option<RecoveryEntry>>;
    fn upsert(&self, entry: RecoveryEntry) -> IpcResult<()>;
    fn remove(&self, device_id: &str) -> IpcResult<()>;
}

struct GlobalRecoveryRecorder;

impl RecoveryRecorder for GlobalRecoveryRecorder {
    fn entry(&self, device_id: &str) -> IpcResult<Option<RecoveryEntry>> {
        Ok(lock(journal_manager())?
            .journal
            .devices
            .get(device_id)
            .cloned())
    }

    fn upsert(&self, entry: RecoveryEntry) -> IpcResult<()> {
        update_journal(|journal| {
            journal.devices.insert(entry.device_id.clone(), entry);
        })
    }

    fn remove(&self, device_id: &str) -> IpcResult<()> {
        update_journal(|journal| {
            journal.devices.remove(device_id);
        })
    }
}

fn update_journal(update: impl FnOnce(&mut RecoveryJournal)) -> IpcResult<()> {
    let mut manager = lock(journal_manager())?;
    let store = manager.store.clone().ok_or_else(|| {
        error(
            "journal_unavailable",
            "Razer recovery journal has not been initialized",
        )
    })?;
    let mut candidate = manager.journal.clone();
    update(&mut candidate);
    store.save(&candidate)?;
    manager.journal = candidate;
    Ok(())
}

fn recovery_for_device(device_id: &str) -> Option<RecoveryEntry> {
    journal_manager()
        .lock()
        .ok()
        .and_then(|manager| manager.journal.devices.get(device_id).cloned())
}

fn next_transaction(state: &mut ProtocolState) -> u8 {
    let transaction = state.transaction;
    state.transaction = (state.transaction + 1) % 31;
    transaction
}

fn rate_to_code(rate_hz: u32) -> Option<u8> {
    match rate_hz {
        8000 => Some(0x01),
        4000 => Some(0x02),
        2000 => Some(0x04),
        1000 => Some(0x08),
        500 => Some(0x10),
        250 => Some(0x20),
        125 => Some(0x40),
        _ => None,
    }
}

fn code_to_rate(code: u8) -> Option<u32> {
    match code {
        0x01 => Some(8000),
        0x02 => Some(4000),
        0x04 => Some(2000),
        0x08 => Some(1000),
        0x10 => Some(500),
        0x20 => Some(250),
        0x40 => Some(125),
        _ => None,
    }
}

fn checksum(packet: &[u8; REPORT_LENGTH]) -> u8 {
    packet[3..=88].iter().fold(0, |value, byte| value ^ byte)
}

fn request(transaction: u8, command: u8, value: u8) -> [u8; REPORT_LENGTH] {
    let mut packet = [0u8; REPORT_LENGTH];
    packet[1] = 0;
    packet[2] = transaction;
    packet[6] = 2;
    packet[7] = 0;
    packet[8] = command;
    packet[9] = PROFILE;
    packet[10] = value;
    packet[89] = checksum(&packet);
    packet
}

#[derive(Clone, Copy)]
struct Response {
    status: u8,
    value: u8,
}

trait FeatureTransport {
    fn send(&mut self, request: [u8; REPORT_LENGTH]) -> IpcResult<()>;
    fn receive(&mut self) -> IpcResult<[u8; REPORT_LENGTH]>;
}

fn validate_response_integrity(response: &[u8; REPORT_LENGTH]) -> IpcResult<()> {
    if response[0] != 0 || response[89] != checksum(response) {
        return Err(error(
            "checksum_mismatch",
            "Razer polling response checksum is invalid",
        ));
    }
    Ok(())
}

fn parse_matching_response(
    request: &[u8; REPORT_LENGTH],
    response: &[u8; REPORT_LENGTH],
) -> IpcResult<Response> {
    if response[6] != 2 || response[7] != 0 || response[8] != request[8] || response[9] != PROFILE {
        return Err(error(
            "protocol_failure",
            "Razer polling response header does not match the request",
        ));
    }
    Ok(Response {
        status: response[1],
        value: response[10],
    })
}

fn command<T: FeatureTransport + ?Sized>(
    transport: &mut T,
    protocol: &mut ProtocolState,
    command: u8,
    value: u8,
) -> IpcResult<Response> {
    let request = request(next_transaction(protocol), command, value);
    transport.send(request)?;

    let mut last_stale_transaction = None;
    let mut last_pending_response = None;
    for attempt in 0..RESPONSE_READ_ATTEMPTS {
        let delay_ms = if attempt == 0 {
            RESPONSE_INITIAL_DELAY_MS
        } else {
            RESPONSE_RETRY_DELAY_MS
        };
        protocol_sleep(Duration::from_millis(delay_ms));
        let response = transport.receive()?;
        validate_response_integrity(&response)?;
        if response[2] != request[2] {
            last_stale_transaction = Some(response[2]);
            continue;
        }
        // Transaction zero makes an empty cached report look current.
        if response.iter().all(|byte| *byte == 0) {
            last_pending_response = Some(Response {
                status: 0,
                value: 0,
            });
            continue;
        }
        let parsed = parse_matching_response(&request, &response)?;
        if !matches!(parsed.status, 0 | 1) {
            return Ok(parsed);
        }
        last_pending_response = Some(parsed);
    }

    if let Some(response) = last_pending_response {
        return Ok(response);
    }
    Err(error(
        "transaction_mismatch",
        "Razer polling response transaction did not match before the read limit",
    )
    .with_detail("expectedTransaction", request[2])
    .with_detail(
        "actualTransaction",
        last_stale_transaction.unwrap_or_default(),
    ))
}

fn status_error(status: u8, operation: &str) -> IpcError {
    let reason = match status {
        0 | 1 => "busy",
        3 => "device_failed",
        4 => "no_response",
        5 => "command_unsupported",
        6 => "profile_unsupported",
        7 => "target_unsupported",
        _ => "protocol_failure",
    };
    error(
        reason,
        format!("Razer polling {operation} returned device status {status}"),
    )
    .with_detail("deviceStatus", status)
}

fn protocol_sleep(duration: Duration) {
    #[cfg(not(test))]
    thread::sleep(duration);
    #[cfg(test)]
    let _ = duration;
}

fn read_rate<T: FeatureTransport + ?Sized>(
    transport: &mut T,
    protocol: &mut ProtocolState,
) -> IpcResult<u32> {
    let response = command(transport, protocol, COMMAND_GET_POLLING_RATE, 0)?;
    match response.status {
        2 => code_to_rate(response.value).ok_or_else(|| {
            error(
                "invalid_rate_code",
                format!(
                    "Razer returned unsupported polling code {:02x}",
                    response.value
                ),
            )
        }),
        status => Err(status_error(status, "read")),
    }
}

fn set_rate_ack<T: FeatureTransport + ?Sized>(
    transport: &mut T,
    protocol: &mut ProtocolState,
    rate_hz: u32,
) -> IpcResult<()> {
    let code = rate_to_code(rate_hz).ok_or_else(|| {
        error(
            "invalid_rate",
            format!("Unsupported polling rate: {rate_hz}"),
        )
    })?;
    let response = command(transport, protocol, COMMAND_SET_POLLING_RATE, code)?;
    match response.status {
        2 => Ok(()),
        status => Err(status_error(status, "write")),
    }
}

fn verify_rate<T: FeatureTransport + ?Sized>(
    transport: &mut T,
    protocol: &mut ProtocolState,
    expected_rate_hz: u32,
) -> IpcResult<u32> {
    let mut actual = None;
    for delay_ms in [80, 180, 350] {
        protocol_sleep(Duration::from_millis(delay_ms));
        let next = read_rate(transport, protocol)?;
        if next == expected_rate_hz {
            return Ok(next);
        }
        actual = Some(next);
    }
    Err(error(
        "verification_failed",
        "Razer polling rate did not reach the requested value",
    )
    .with_detail("expectedRateHz", expected_rate_hz)
    .with_detail("actualRateHz", actual.unwrap_or_default()))
}

fn explicit_unsupported(operation_error: &IpcError) -> bool {
    matches!(
        operation_error.code.as_str(),
        "razer_polling.command_unsupported"
            | "razer_polling.profile_unsupported"
            | "razer_polling.target_unsupported"
    )
}

fn may_have_changed(operation_error: &IpcError) -> bool {
    matches!(
        operation_error.code.as_str(),
        "razer_polling.no_response"
            | "razer_polling.set_feature_failed"
            | "razer_polling.get_feature_failed"
            | "razer_polling.checksum_mismatch"
            | "razer_polling.transaction_mismatch"
            | "razer_polling.protocol_failure"
            | "razer_polling.invalid_rate_code"
            | "razer_polling.verification_failed"
            | "razer_polling.journal_write_failed"
    )
}

fn recovery_entry(
    device: &RazerPollingDevice,
    runtime: &DeviceRuntime,
    intended_rate_hz: Option<u32>,
    possibly_changed: bool,
) -> IpcResult<RecoveryEntry> {
    Ok(RecoveryEntry {
        device_id: device.device_id.clone(),
        identity_persistent: device.identity_persistent,
        vendor_id: device.vendor_id,
        product_id: device.product_id,
        baseline_rate_hz: runtime.baseline_rate_hz.ok_or_else(|| {
            error(
                "baseline_missing",
                "No baseline polling rate has been captured for this device",
            )
        })?,
        last_confirmed_rate_hz: runtime.last_confirmed_rate_hz.ok_or_else(|| {
            error(
                "confirmed_rate_missing",
                "No confirmed polling rate is recorded for this device",
            )
        })?,
        intended_rate_hz,
        possibly_changed,
    })
}

fn latch_failure(
    runtime: &mut DeviceRuntime,
    operation_error: &IpcError,
    changed_may_be_unknown: bool,
) {
    runtime.faulted = !explicit_unsupported(operation_error);
    runtime.possibly_changed = changed_may_be_unknown || may_have_changed(operation_error);
    runtime.last_error = Some(operation_error.code.clone());
}

fn clear_recovery(runtime: &mut DeviceRuntime) {
    runtime.baseline_rate_hz = None;
    runtime.last_confirmed_rate_hz = None;
    runtime.possibly_changed = false;
}

fn set_rate_with_transport<T: FeatureTransport + ?Sized, R: RecoveryRecorder + ?Sized>(
    transport: &mut T,
    protocol: &mut ProtocolState,
    runtime: &mut DeviceRuntime,
    device: &RazerPollingDevice,
    target_rate_hz: u32,
    recorder: &R,
) -> IpcResult<RazerPollingApplyResult> {
    if rate_to_code(target_rate_hz).is_none() {
        return Err(error(
            "invalid_rate",
            format!("Unsupported polling rate: {target_rate_hz}"),
        ));
    }
    if runtime.faulted {
        return Err(error(
            "faulted",
            "Probe the device successfully before sending another polling-rate command",
        ));
    }

    let before = match read_rate(transport, protocol) {
        Ok(rate_hz) => rate_hz,
        Err(read_error) => {
            latch_failure(runtime, &read_error, false);
            return Err(read_error);
        }
    };
    runtime.current_rate_hz = Some(before);
    runtime.confirmed_supported_rates_hz.insert(before);
    if before == target_rate_hz {
        runtime.last_error = None;
        return Ok(RazerPollingApplyResult {
            device_id: device.device_id.clone(),
            changed: false,
            requested_rate_hz: target_rate_hz,
            previous_rate_hz: before,
            current_rate_hz: before,
            restored: false,
            possibly_changed: false,
        });
    }

    let captured_now = runtime.baseline_rate_hz.is_none();
    if captured_now {
        // Baseline capture is deliberately adjacent to, and only performed for,
        // the first real SET. A normal probe never creates recovery ownership.
        runtime.baseline_rate_hz = Some(before);
        runtime.last_confirmed_rate_hz = Some(before);
    }
    let pending_entry = recovery_entry(device, runtime, Some(target_rate_hz), true)?;
    if let Err(journal_error) = recorder.upsert(pending_entry) {
        if captured_now {
            clear_recovery(runtime);
        }
        latch_failure(runtime, &journal_error, false);
        return Err(journal_error);
    }

    if let Err(set_error) = set_rate_ack(transport, protocol, target_rate_hz) {
        if explicit_unsupported(&set_error) {
            if captured_now {
                recorder.remove(&device.device_id)?;
                clear_recovery(runtime);
            } else {
                recorder.upsert(recovery_entry(device, runtime, None, false)?)?;
            }
            runtime.last_error = Some(set_error.code.clone());
            runtime.faulted = false;
            runtime.possibly_changed = false;
        } else {
            latch_failure(runtime, &set_error, true);
        }
        return Err(set_error);
    }

    let current = match verify_rate(transport, protocol, target_rate_hz) {
        Ok(current) => current,
        Err(verification_error) => {
            // A successful SET ACK without a matching readback is ambiguous.
            // Do not issue a compensating write; the explicit probe is the
            // only operation that can unlock this device.
            latch_failure(runtime, &verification_error, true);
            return Err(verification_error);
        }
    };

    runtime.current_rate_hz = Some(current);
    runtime.last_confirmed_rate_hz = Some(current);
    runtime.confirmed_supported_rates_hz.insert(current);
    runtime.faulted = false;
    runtime.possibly_changed = false;
    runtime.last_error = None;
    if let Err(journal_error) = recorder.upsert(recovery_entry(device, runtime, None, false)?) {
        latch_failure(runtime, &journal_error, true);
        return Err(journal_error);
    }
    Ok(RazerPollingApplyResult {
        device_id: device.device_id.clone(),
        changed: true,
        requested_rate_hz: target_rate_hz,
        previous_rate_hz: before,
        current_rate_hz: current,
        restored: false,
        possibly_changed: false,
    })
}

fn restore_with_transport<T: FeatureTransport + ?Sized, R: RecoveryRecorder + ?Sized>(
    transport: &mut T,
    protocol: &mut ProtocolState,
    runtime: &mut DeviceRuntime,
    device: &RazerPollingDevice,
    recorder: &R,
) -> IpcResult<RazerPollingApplyResult> {
    if runtime.faulted {
        return Err(error(
            "faulted",
            "Probe the device successfully before restoring its polling rate",
        ));
    }
    let baseline = runtime.baseline_rate_hz.ok_or_else(|| {
        error(
            "baseline_missing",
            "No polling-rate baseline is recorded for this device",
        )
    })?;
    let current = match read_rate(transport, protocol) {
        Ok(rate_hz) => rate_hz,
        Err(read_error) => {
            latch_failure(runtime, &read_error, false);
            return Err(read_error);
        }
    };
    runtime.current_rate_hz = Some(current);

    if current == baseline {
        recorder.remove(&device.device_id)?;
        clear_recovery(runtime);
        runtime.faulted = false;
        runtime.last_error = None;
        return Ok(RazerPollingApplyResult {
            device_id: device.device_id.clone(),
            changed: false,
            requested_rate_hz: baseline,
            previous_rate_hz: current,
            current_rate_hz: current,
            restored: false,
            possibly_changed: false,
        });
    }

    if runtime.last_confirmed_rate_hz != Some(current) {
        let ownership_error = error(
            "ownership_lost",
            "The current polling rate was changed outside MxTools; the baseline was not written",
        )
        .with_detail("baselineRateHz", baseline)
        .with_detail("currentRateHz", current)
        .with_detail(
            "lastConfirmedRateHz",
            runtime.last_confirmed_rate_hz.unwrap_or_default(),
        );
        runtime.faulted = true;
        runtime.possibly_changed = false;
        runtime.last_error = Some(ownership_error.code.clone());
        return Err(ownership_error);
    }

    recorder.upsert(recovery_entry(device, runtime, Some(baseline), true)?)?;
    if let Err(set_error) = set_rate_ack(transport, protocol, baseline) {
        latch_failure(runtime, &set_error, true);
        return Err(set_error);
    }
    let restored = match verify_rate(transport, protocol, baseline) {
        Ok(rate_hz) => rate_hz,
        Err(verification_error) => {
            latch_failure(runtime, &verification_error, true);
            return Err(verification_error);
        }
    };
    runtime.current_rate_hz = Some(restored);
    runtime.last_confirmed_rate_hz = Some(restored);
    runtime.confirmed_supported_rates_hz.insert(restored);
    if let Err(journal_error) = recorder.remove(&device.device_id) {
        latch_failure(runtime, &journal_error, true);
        return Err(journal_error);
    }
    clear_recovery(runtime);
    runtime.faulted = false;
    runtime.last_error = None;
    Ok(RazerPollingApplyResult {
        device_id: device.device_id.clone(),
        changed: true,
        requested_rate_hz: baseline,
        previous_rate_hz: current,
        current_rate_hz: restored,
        restored: true,
        possibly_changed: false,
    })
}

fn reconcile_successful_probe<R: RecoveryRecorder + ?Sized>(
    runtime: &mut DeviceRuntime,
    device: &RazerPollingDevice,
    current_rate_hz: u32,
    recorder: &R,
) -> IpcResult<()> {
    runtime.connected = true;
    runtime.current_rate_hz = Some(current_rate_hz);
    runtime.confirmed_supported_rates_hz.insert(current_rate_hz);

    if let Some(entry) = recorder.entry(&device.device_id)? {
        let identity_matches = entry.vendor_id == device.vendor_id
            && entry.product_id == device.product_id
            && entry.identity_persistent == device.identity_persistent;
        if !identity_matches || current_rate_hz == entry.baseline_rate_hz {
            // A successful explicit probe re-establishes a safe starting point.
            // If ownership cannot be proven, discard the old restore claim and
            // capture the observed value only before the next actual SET.
            recorder.remove(&device.device_id)?;
            clear_recovery(runtime);
        } else if current_rate_hz == entry.last_confirmed_rate_hz {
            runtime.baseline_rate_hz = Some(entry.baseline_rate_hz);
            runtime.last_confirmed_rate_hz = Some(entry.last_confirmed_rate_hz);
        } else if entry.possibly_changed && entry.intended_rate_hz == Some(current_rate_hz) {
            // The explicit GET confirms the exact pending target from the
            // crash-safe journal. It is now safe to retain ownership and make
            // the original baseline available for a guarded restore.
            runtime.baseline_rate_hz = Some(entry.baseline_rate_hz);
            runtime.last_confirmed_rate_hz = Some(current_rate_hz);
            recorder.upsert(recovery_entry(device, runtime, None, false)?)?;
        } else {
            recorder.remove(&device.device_id)?;
            clear_recovery(runtime);
        }
    }
    runtime.faulted = false;
    runtime.possibly_changed = false;
    runtime.last_error = None;
    Ok(())
}

fn verify_capabilities_with_transport<
    T: FeatureTransport + ?Sized,
    R: RecoveryRecorder + ?Sized,
>(
    transport: &mut T,
    protocol: &mut ProtocolState,
    runtime: &mut DeviceRuntime,
    device: &RazerPollingDevice,
    recorder: &R,
) -> RazerPollingCapabilityResult {
    let original = match read_rate(transport, protocol) {
        Ok(rate_hz) => rate_hz,
        Err(read_error) => {
            latch_failure(runtime, &read_error, false);
            return RazerPollingCapabilityResult {
                device_id: device.device_id.clone(),
                original_rate_hz: None,
                supported_rates_hz: runtime
                    .confirmed_supported_rates_hz
                    .iter()
                    .copied()
                    .collect(),
                highest_confirmed_rate_hz: runtime
                    .confirmed_supported_rates_hz
                    .iter()
                    .next_back()
                    .copied(),
                restored_rate_hz: None,
                complete: false,
                stopped_reason: Some(read_error.code),
                faulted: runtime.faulted,
                possibly_changed: runtime.possibly_changed,
            };
        }
    };
    if let Err(journal_error) = reconcile_successful_probe(runtime, device, original, recorder) {
        latch_failure(runtime, &journal_error, false);
        return RazerPollingCapabilityResult {
            device_id: device.device_id.clone(),
            original_rate_hz: Some(original),
            supported_rates_hz: vec![original],
            highest_confirmed_rate_hz: Some(original),
            restored_rate_hz: None,
            complete: false,
            stopped_reason: Some(journal_error.code),
            faulted: runtime.faulted,
            possibly_changed: runtime.possibly_changed,
        };
    }

    let mut complete = true;
    let mut stopped_reason = None;
    for candidate in SUPPORTED_RATES
        .iter()
        .copied()
        .filter(|rate_hz| *rate_hz != original)
    {
        match set_rate_with_transport(transport, protocol, runtime, device, candidate, recorder) {
            Ok(_) => {}
            Err(operation_error) if explicit_unsupported(&operation_error) => {
                // A missing lower tier says nothing about higher tiers. Once
                // verification reaches rates above the original value, the
                // ascending list is monotonic and an unsupported reply is the
                // confirmed upper boundary.
                if candidate > original {
                    stopped_reason = Some(operation_error.code);
                    break;
                }
            }
            Err(operation_error) => {
                // An ambiguous reply terminates verification immediately. The
                // recovery journal remains intact and no restore write follows.
                complete = false;
                stopped_reason = Some(operation_error.code);
                break;
            }
        }
    }

    let restored_rate_hz = if !runtime.faulted && runtime.baseline_rate_hz.is_some() {
        match restore_with_transport(transport, protocol, runtime, device, recorder) {
            Ok(result) => Some(result.current_rate_hz),
            Err(restore_error) => {
                complete = false;
                stopped_reason.get_or_insert(restore_error.code);
                None
            }
        }
    } else if runtime.current_rate_hz == Some(original) {
        Some(original)
    } else {
        None
    };

    let supported_rates_hz = runtime
        .confirmed_supported_rates_hz
        .iter()
        .copied()
        .collect::<Vec<_>>();
    RazerPollingCapabilityResult {
        device_id: device.device_id.clone(),
        original_rate_hz: Some(original),
        highest_confirmed_rate_hz: supported_rates_hz.last().copied(),
        supported_rates_hz,
        restored_rate_hz,
        complete,
        stopped_reason,
        faulted: runtime.faulted,
        possibly_changed: runtime.possibly_changed,
    }
}

struct BusyGuard<'a>(&'a AtomicBool);

impl<'a> BusyGuard<'a> {
    fn new(flag: &'a AtomicBool) -> Self {
        flag.store(true, Ordering::Release);
        Self(flag)
    }
}

impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct ForegroundIdentity {
    executable_path: Option<String>,
    package_family_name: Option<String>,
}

#[cfg(windows)]
mod windows {
    use super::*;
    use std::mem::{size_of, zeroed};
    use std::ptr::{null, null_mut};
    use winapi::ctypes::c_void;
    use winapi::shared::devpkey::DEVPKEY_Device_ContainerId;
    use winapi::shared::devpropdef::{DEVPROPTYPE, DEVPROP_TYPE_GUID};
    use winapi::shared::guiddef::GUID;
    use winapi::shared::hidpi::{
        HidP_GetCaps, HIDP_CAPS, HIDP_STATUS_SUCCESS, PHIDP_PREPARSED_DATA,
    };
    use winapi::shared::hidsdi::{
        HidD_FreePreparsedData, HidD_GetAttributes, HidD_GetFeature, HidD_GetHidGuid,
        HidD_GetPreparsedData, HidD_GetProductString, HidD_GetSerialNumberString, HidD_SetFeature,
        HIDD_ATTRIBUTES,
    };
    use winapi::shared::minwindef::{DWORD, FALSE, HINSTANCE};
    use winapi::shared::windef::HWND;
    use winapi::shared::winerror::{ERROR_INSUFFICIENT_BUFFER, ERROR_NO_MORE_ITEMS};
    use winapi::um::errhandlingapi::GetLastError;
    use winapi::um::fileapi::{CreateFileW, OPEN_EXISTING};
    use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
    use winapi::um::processthreadsapi::OpenProcess;
    use winapi::um::setupapi::{
        SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInterfaces, SetupDiGetClassDevsW,
        SetupDiGetDeviceInstanceIdW, SetupDiGetDeviceInterfaceDetailW, SetupDiGetDevicePropertyW,
        DIGCF_DEVICEINTERFACE, DIGCF_PRESENT, SP_DEVICE_INTERFACE_DATA,
        SP_DEVICE_INTERFACE_DETAIL_DATA_W, SP_DEVINFO_DATA,
    };
    use winapi::um::winbase::QueryFullProcessImageNameW;
    use winapi::um::winnt::{
        FILE_SHARE_READ, FILE_SHARE_WRITE, GENERIC_READ, GENERIC_WRITE, HANDLE,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use winapi::um::winuser::GetWindowThreadProcessId;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetPackageFamilyName(
            process: HANDLE,
            package_family_name_length: *mut u32,
            package_family_name: *mut u16,
        ) -> i32;
        fn GetModuleHandleW(module_name: *const u16) -> HINSTANCE;
    }

    struct DeviceInfoSet(HANDLE);

    impl Drop for DeviceInfoSet {
        fn drop(&mut self) {
            unsafe {
                SetupDiDestroyDeviceInfoList(self.0);
            }
        }
    }

    pub(super) struct HidTransport {
        handle: HANDLE,
    }

    impl Drop for HidTransport {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.handle);
            }
        }
    }

    impl FeatureTransport for HidTransport {
        fn send(&mut self, request: [u8; REPORT_LENGTH]) -> IpcResult<()> {
            let ok = unsafe {
                HidD_SetFeature(
                    self.handle,
                    request.as_ptr() as *mut c_void,
                    REPORT_LENGTH as u32,
                )
            };
            if ok == 0 {
                return Err(error("set_feature_failed", "HidD_SetFeature failed")
                    .with_detail("win32Code", unsafe { GetLastError() }));
            }
            Ok(())
        }

        fn receive(&mut self) -> IpcResult<[u8; REPORT_LENGTH]> {
            let mut response = [0u8; REPORT_LENGTH];
            let ok = unsafe {
                HidD_GetFeature(
                    self.handle,
                    response.as_mut_ptr() as *mut c_void,
                    REPORT_LENGTH as u32,
                )
            };
            if ok == 0 {
                return Err(error("get_feature_failed", "HidD_GetFeature failed")
                    .with_detail("win32Code", unsafe { GetLastError() }));
            }
            Ok(response)
        }
    }

    fn wide_string(value: &[u16]) -> String {
        let end = value
            .iter()
            .position(|value| *value == 0)
            .unwrap_or(value.len());
        String::from_utf16_lossy(&value[..end])
    }

    fn format_guid(value: &GUID) -> String {
        format!(
            "{:08X}-{:04X}-{:04X}-{:02X}{:02X}-{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}",
            value.Data1,
            value.Data2,
            value.Data3,
            value.Data4[0],
            value.Data4[1],
            value.Data4[2],
            value.Data4[3],
            value.Data4[4],
            value.Data4[5],
            value.Data4[6],
            value.Data4[7],
        )
    }

    fn container_id(device_set: HANDLE, device_info: &mut SP_DEVINFO_DATA) -> Option<String> {
        let mut property_type: DEVPROPTYPE = 0;
        let mut value: GUID = unsafe { zeroed() };
        let mut required_size = 0u32;
        let ok = unsafe {
            SetupDiGetDevicePropertyW(
                device_set,
                device_info,
                &DEVPKEY_Device_ContainerId,
                &mut property_type,
                &mut value as *mut GUID as *mut u8,
                size_of::<GUID>() as u32,
                &mut required_size,
                0,
            )
        };
        if ok == FALSE
            || property_type != DEVPROP_TYPE_GUID
            || required_size != size_of::<GUID>() as u32
            || (value.Data1 == 0
                && value.Data2 == 0
                && value.Data3 == 0
                && value.Data4.iter().all(|byte| *byte == 0))
        {
            return None;
        }
        Some(format_guid(&value))
    }

    fn device_instance_id(device_set: HANDLE, device_info: &mut SP_DEVINFO_DATA) -> Option<String> {
        let mut required_size = 0u32;
        unsafe {
            SetupDiGetDeviceInstanceIdW(device_set, device_info, null_mut(), 0, &mut required_size);
        }
        if required_size == 0 {
            return None;
        }
        let mut value = vec![0u16; required_size as usize];
        let ok = unsafe {
            SetupDiGetDeviceInstanceIdW(
                device_set,
                device_info,
                value.as_mut_ptr(),
                value.len() as u32,
                &mut required_size,
            )
        };
        (ok != FALSE)
            .then(|| wide_string(&value))
            .filter(|value| !value.trim().is_empty())
    }

    fn hid_string(handle: HANDLE, serial: bool) -> Option<String> {
        let mut value = [0u16; 256];
        let ok = unsafe {
            if serial {
                HidD_GetSerialNumberString(
                    handle,
                    value.as_mut_ptr() as *mut c_void,
                    (value.len() * size_of::<u16>()) as u32,
                )
            } else {
                HidD_GetProductString(
                    handle,
                    value.as_mut_ptr() as *mut c_void,
                    (value.len() * size_of::<u16>()) as u32,
                )
            }
        };
        (ok != 0)
            .then(|| wide_string(&value))
            .filter(|value| !value.trim().is_empty())
    }

    fn device_matches(handle: HANDLE) -> Option<(u16, u16)> {
        let mut attributes: HIDD_ATTRIBUTES = unsafe { zeroed() };
        attributes.Size = size_of::<HIDD_ATTRIBUTES>() as u32;
        if unsafe { HidD_GetAttributes(handle, &mut attributes) } == 0
            || attributes.VendorID != RAZER_VENDOR_ID
        {
            return None;
        }
        let mut preparsed: PHIDP_PREPARSED_DATA = null_mut();
        if unsafe { HidD_GetPreparsedData(handle, &mut preparsed) } == 0 {
            return None;
        }
        let mut caps: HIDP_CAPS = unsafe { zeroed() };
        let status = unsafe { HidP_GetCaps(preparsed, &mut caps) };
        unsafe {
            HidD_FreePreparsedData(preparsed);
        }
        (status == HIDP_STATUS_SUCCESS
            && caps.FeatureReportByteLength as usize == REPORT_LENGTH
            && caps.UsagePage == FEATURE_USAGE_PAGE
            && caps.Usage == FEATURE_USAGE)
            .then_some((attributes.VendorID, attributes.ProductID))
    }

    pub(super) struct OpenedTransport {
        pub info: RazerPollingDevice,
        fallback_device_id: String,
        pub transport: HidTransport,
    }

    pub(super) fn enumerate_transports() -> IpcResult<Vec<OpenedTransport>> {
        let mut hid_guid: GUID = unsafe { zeroed() };
        unsafe {
            HidD_GetHidGuid(&mut hid_guid);
        }
        let raw_set = unsafe {
            SetupDiGetClassDevsW(
                &hid_guid,
                null(),
                null_mut(),
                DIGCF_PRESENT | DIGCF_DEVICEINTERFACE,
            )
        };
        if raw_set == INVALID_HANDLE_VALUE {
            return Err(error("enumeration_failed", "SetupDiGetClassDevsW failed")
                .with_detail("win32Code", unsafe { GetLastError() }));
        }
        let device_set = DeviceInfoSet(raw_set);
        let mut opened = Vec::new();
        let mut index = 0;
        loop {
            let mut interface_data: SP_DEVICE_INTERFACE_DATA = unsafe { zeroed() };
            interface_data.cbSize = size_of::<SP_DEVICE_INTERFACE_DATA>() as DWORD;
            if unsafe {
                SetupDiEnumDeviceInterfaces(
                    device_set.0,
                    null_mut(),
                    &hid_guid,
                    index,
                    &mut interface_data,
                )
            } == FALSE
            {
                let code = unsafe { GetLastError() };
                if code == ERROR_NO_MORE_ITEMS {
                    break;
                }
                return Err(
                    error("enumeration_failed", "SetupDiEnumDeviceInterfaces failed")
                        .with_detail("win32Code", code),
                );
            }
            index += 1;
            let mut required = 0u32;
            let first = unsafe {
                SetupDiGetDeviceInterfaceDetailW(
                    device_set.0,
                    &mut interface_data,
                    null_mut(),
                    0,
                    &mut required,
                    null_mut(),
                )
            };
            if first != FALSE
                || unsafe { GetLastError() } != ERROR_INSUFFICIENT_BUFFER
                || required == 0
            {
                continue;
            }
            let words = (required as usize).div_ceil(size_of::<usize>());
            let mut storage = vec![0usize; words];
            let detail = storage.as_mut_ptr() as *mut SP_DEVICE_INTERFACE_DETAIL_DATA_W;
            let mut device_info: SP_DEVINFO_DATA = unsafe { zeroed() };
            device_info.cbSize = size_of::<SP_DEVINFO_DATA>() as DWORD;
            unsafe {
                (*detail).cbSize = size_of::<SP_DEVICE_INTERFACE_DETAIL_DATA_W>() as DWORD;
            }
            if unsafe {
                SetupDiGetDeviceInterfaceDetailW(
                    device_set.0,
                    &mut interface_data,
                    detail,
                    required,
                    null_mut(),
                    &mut device_info,
                )
            } == FALSE
            {
                continue;
            }
            let path_offset = unsafe { (*detail).DevicePath.as_ptr() as usize - detail as usize };
            let path_len =
                ((required as usize).saturating_sub(path_offset) / size_of::<u16>()).max(1);
            let path_slice =
                unsafe { std::slice::from_raw_parts((*detail).DevicePath.as_ptr(), path_len) };
            let path = wide_string(path_slice);
            let normalized_path = path.to_ascii_uppercase();
            if !normalized_path.contains("VID_1532") || !normalized_path.contains("MI_03") {
                continue;
            }
            let wide = path
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect::<Vec<_>>();
            let handle = unsafe {
                CreateFileW(
                    wide.as_ptr(),
                    GENERIC_READ | GENERIC_WRITE,
                    FILE_SHARE_READ | FILE_SHARE_WRITE,
                    null_mut(),
                    OPEN_EXISTING,
                    0,
                    null_mut(),
                )
            };
            if handle == INVALID_HANDLE_VALUE {
                continue;
            }
            let transport = HidTransport { handle };
            let Some((vendor_id, product_id)) = device_matches(transport.handle) else {
                continue;
            };
            let serial = hid_string(transport.handle, true);
            let container_id = container_id(device_set.0, &mut device_info);
            let instance_id = device_instance_id(device_set.0, &mut device_info);
            let identity = select_device_identity(
                vendor_id,
                product_id,
                serial.as_deref(),
                container_id.as_deref(),
                instance_id.as_deref(),
                &path,
            );
            let path_fallback =
                select_device_identity(vendor_id, product_id, None, None, None, &path);
            let fallback_device_id = opaque_device_id(&path_fallback.material);
            let connection = if product_id == 0x00e6 {
                "wireless"
            } else {
                "wired"
            }
            .to_string();
            opened.push(OpenedTransport {
                info: RazerPollingDevice {
                    device_id: opaque_device_id(&identity.material),
                    identity_persistent: identity.persistent,
                    name: hid_string(transport.handle, false)
                        .unwrap_or_else(|| "Razer HID device".into()),
                    vendor_id,
                    product_id,
                    connection,
                },
                fallback_device_id,
                transport,
            });
        }
        let mut identity_counts = HashMap::<String, usize>::new();
        for device in &opened {
            *identity_counts
                .entry(device.info.device_id.clone())
                .or_default() += 1;
        }
        for device in &mut opened {
            let duplicate_count = identity_counts
                .get(&device.info.device_id)
                .copied()
                .unwrap_or_default();
            let (device_id, persistent) = resolve_duplicate_device_id(
                &device.info.device_id,
                device.info.identity_persistent,
                &device.fallback_device_id,
                duplicate_count,
            );
            device.info.device_id = device_id;
            device.info.identity_persistent = persistent;
        }
        opened.sort_by(|left, right| left.info.device_id.cmp(&right.info.device_id));
        opened.dedup_by(|left, right| left.info.device_id == right.info.device_id);
        Ok(opened)
    }

    pub(super) fn open_transport_by_id(device_id: &str) -> IpcResult<OpenedTransport> {
        enumerate_transports()?
            .into_iter()
            .find(|opened| opened.info.device_id == device_id)
            .ok_or_else(|| {
                error(
                    "device_not_found",
                    format!("Razer device is not connected: {device_id}"),
                )
                .with_detail("deviceId", device_id)
            })
    }

    fn package_family_name(process: HANDLE) -> Option<String> {
        const APPMODEL_ERROR_NO_PACKAGE: i32 = 15700;
        let mut length = 0u32;
        let first = unsafe { GetPackageFamilyName(process, &mut length, null_mut()) };
        if first == APPMODEL_ERROR_NO_PACKAGE || length == 0 {
            return None;
        }
        if first != ERROR_INSUFFICIENT_BUFFER as i32 {
            return None;
        }
        let mut buffer = vec![0u16; length as usize];
        let second = unsafe { GetPackageFamilyName(process, &mut length, buffer.as_mut_ptr()) };
        (second == 0).then(|| wide_string(&buffer))
    }

    pub(super) fn foreground_identity(hwnd_value: usize) -> ForegroundIdentity {
        let window = hwnd_value as HWND;
        if window.is_null() {
            return ForegroundIdentity::default();
        }
        let mut process_id = 0u32;
        unsafe {
            GetWindowThreadProcessId(window, &mut process_id);
        }
        if process_id == 0 {
            return ForegroundIdentity::default();
        }
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) };
        if process.is_null() {
            return ForegroundIdentity::default();
        }
        let mut buffer = vec![0u16; 32768];
        let mut length = buffer.len() as u32;
        let executable_path =
            (unsafe { QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length) }
                != FALSE)
                .then(|| wide_string(&buffer[..length as usize]));
        let package_family_name = package_family_name(process);
        unsafe {
            CloseHandle(process);
        }
        ForegroundIdentity {
            executable_path,
            package_family_name,
        }
    }

    #[repr(C)]
    struct DeviceBroadcastInterface {
        size: u32,
        device_type: u32,
        reserved: u32,
        class_guid: GUID,
        name: [u16; 1],
    }

    pub(super) unsafe extern "system" fn device_notification_window_proc(
        hwnd: HWND,
        message: u32,
        wparam: usize,
        lparam: isize,
    ) -> isize {
        const WM_DEVICECHANGE: u32 = 0x0219;
        const DBT_DEVICEARRIVAL: usize = 0x8000;
        const DBT_DEVICEREMOVECOMPLETE: usize = 0x8004;
        if message == WM_DEVICECHANGE
            && matches!(wparam, DBT_DEVICEARRIVAL | DBT_DEVICEREMOVECOMPLETE)
        {
            DEVICE_REFRESH_PENDING.store(true, Ordering::Release);
            let foreground = winapi::um::winuser::GetForegroundWindow();
            if !foreground.is_null() {
                foreground_events().publish(foreground as usize);
            }
        }
        winapi::um::winuser::DefWindowProcW(hwnd, message, wparam, lparam)
    }

    pub(super) unsafe fn create_device_notification_window(
    ) -> Result<(HWND, winapi::um::winuser::HDEVNOTIFY), String> {
        use winapi::um::winuser::{
            CreateWindowExW, DestroyWindow, RegisterClassW, RegisterDeviceNotificationW,
            DEVICE_NOTIFY_WINDOW_HANDLE, HWND_MESSAGE, WNDCLASSW,
        };

        const ERROR_CLASS_ALREADY_EXISTS: u32 = 1410;
        const DBT_DEVTYP_DEVICEINTERFACE: u32 = 0x00000005;
        let class_name = "MxToolsRazerDeviceNotifications"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let instance = GetModuleHandleW(null());
        let mut window_class: WNDCLASSW = zeroed();
        window_class.lpfnWndProc = Some(device_notification_window_proc);
        window_class.hInstance = instance;
        window_class.lpszClassName = class_name.as_ptr();
        if RegisterClassW(&window_class) == 0 && GetLastError() != ERROR_CLASS_ALREADY_EXISTS {
            return Err(format!(
                "RegisterClassW failed with Win32 code {}",
                GetLastError()
            ));
        }
        let window = CreateWindowExW(
            0,
            class_name.as_ptr(),
            class_name.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            null_mut(),
            instance,
            null_mut(),
        );
        if window.is_null() {
            return Err(format!(
                "CreateWindowExW failed with Win32 code {}",
                GetLastError()
            ));
        }
        let mut hid_guid: GUID = zeroed();
        HidD_GetHidGuid(&mut hid_guid);
        let mut filter = DeviceBroadcastInterface {
            size: size_of::<DeviceBroadcastInterface>() as u32,
            device_type: DBT_DEVTYP_DEVICEINTERFACE,
            reserved: 0,
            class_guid: hid_guid,
            name: [0],
        };
        let notification = RegisterDeviceNotificationW(
            window as HANDLE,
            &mut filter as *mut DeviceBroadcastInterface as *mut c_void,
            DEVICE_NOTIFY_WINDOW_HANDLE,
        );
        if notification.is_null() {
            let code = GetLastError();
            DestroyWindow(window);
            return Err(format!(
                "RegisterDeviceNotificationW failed with Win32 code {code}"
            ));
        }
        Ok((window, notification))
    }
}

#[cfg(windows)]
fn enumerate_transports() -> IpcResult<Vec<windows::OpenedTransport>> {
    windows::enumerate_transports()
}

#[cfg(windows)]
fn open_transport_by_id(device_id: &str) -> IpcResult<windows::OpenedTransport> {
    windows::open_transport_by_id(device_id)
}

fn register_device(info: &RazerPollingDevice) -> IpcResult<Arc<DeviceSlot>> {
    let mut controller = lock(controller())?;
    if let Some(slot) = controller.devices.get(&info.device_id) {
        *lock(&slot.info)? = info.clone();
        lock(&slot.runtime)?.connected = true;
        return Ok(slot.clone());
    }
    let recovery = recovery_for_device(&info.device_id);
    let slot = Arc::new(DeviceSlot::new(info.clone(), recovery.as_ref()));
    controller
        .devices
        .insert(info.device_id.clone(), slot.clone());
    Ok(slot)
}

#[cfg(windows)]
fn refresh_registry(opened: &[windows::OpenedTransport]) -> IpcResult<()> {
    let existing = lock(controller())?
        .devices
        .values()
        .cloned()
        .collect::<Vec<_>>();
    for slot in existing {
        lock(&slot.runtime)?.connected = false;
    }
    for device in opened {
        register_device(&device.info)?;
    }
    Ok(())
}

fn slot_by_id(device_id: &str) -> IpcResult<Arc<DeviceSlot>> {
    lock(controller())?
        .devices
        .get(device_id)
        .cloned()
        .ok_or_else(|| {
            error(
                "device_not_found",
                format!("Razer device is not connected: {device_id}"),
            )
            .with_detail("deviceId", device_id)
        })
}

fn snapshot(
    slot: &DeviceSlot,
    config: Option<&RazerPollingConfig>,
) -> IpcResult<RazerPollingStatus> {
    let device = lock(&slot.info)?.clone();
    let runtime = lock(&slot.runtime)?.clone();
    let auto_enabled = config.is_some_and(|config| {
        config.enabled
            && config
                .devices
                .iter()
                .any(|configured| configured.device_id == device.device_id)
    });
    Ok(RazerPollingStatus {
        available: runtime.connected,
        device,
        current_rate_hz: runtime.current_rate_hz,
        baseline_rate_hz: runtime.baseline_rate_hz,
        supported_rates_hz: runtime
            .confirmed_supported_rates_hz
            .iter()
            .copied()
            .collect(),
        candidate_rates_hz: SUPPORTED_RATES.to_vec(),
        busy: slot.busy.load(Ordering::Acquire),
        faulted: runtime.faulted,
        possibly_changed: runtime.possibly_changed,
        last_error: runtime.last_error,
        auto_enabled,
        auto_target_rate_hz: runtime.auto_target_rate_hz,
        active_profile_id: runtime.active_profile_id,
    })
}

fn snapshots() -> IpcResult<Vec<RazerPollingStatus>> {
    let (slots, config) = {
        let controller = lock(controller())?;
        (
            controller.devices.values().cloned().collect::<Vec<_>>(),
            controller.auto_config.clone(),
        )
    };
    let mut statuses = Vec::new();
    for slot in slots {
        if lock(&slot.runtime)?.connected {
            statuses.push(snapshot(&slot, config.as_ref())?);
        }
    }
    statuses.sort_by(|left, right| {
        left.device
            .name
            .cmp(&right.device.name)
            .then_with(|| left.device.device_id.cmp(&right.device.device_id))
    });
    Ok(statuses)
}

fn validate_config(config: &RazerPollingConfig) -> IpcResult<()> {
    if config.schema_version != CONFIG_SCHEMA_VERSION {
        return Err(error(
            "config_version_unsupported",
            format!(
                "Unsupported Razer polling config version: {}",
                config.schema_version
            ),
        ));
    }
    let mut device_ids = HashSet::new();
    for device in &config.devices {
        if device.device_id.trim().is_empty() || !device_ids.insert(device.device_id.as_str()) {
            return Err(error(
                "invalid_config",
                "Razer device IDs must be non-empty and unique",
            ));
        }
        if rate_to_code(device.idle_rate_hz).is_none() {
            return Err(error(
                "invalid_rate",
                format!("Unsupported idle polling rate: {}", device.idle_rate_hz),
            ));
        }
        let mut profile_ids = HashSet::new();
        for profile in &device.profiles {
            if profile.profile_id.trim().is_empty()
                || !profile_ids.insert(profile.profile_id.as_str())
                || rate_to_code(profile.rate_hz).is_none()
                || (profile
                    .executable_paths
                    .iter()
                    .all(|path| path.trim().is_empty())
                    && profile
                        .package_family_names
                        .iter()
                        .all(|name| name.trim().is_empty()))
            {
                return Err(error(
                    "invalid_config",
                    "Every Razer profile needs a unique ID, a supported rate, and at least one matcher",
                ));
            }
        }
    }
    Ok(())
}

fn normalize_executable(value: &str) -> String {
    value.trim().replace('/', "\\").to_ascii_lowercase()
}

fn normalize_package_family(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn target_for_device(
    config: &RazerPollingConfig,
    device_id: &str,
    foreground: &ForegroundIdentity,
) -> Option<(u32, Option<String>)> {
    let device = config
        .devices
        .iter()
        .find(|device| device.device_id == device_id)?;
    let foreground_executable = foreground
        .executable_path
        .as_deref()
        .map(normalize_executable);
    let foreground_package = foreground
        .package_family_name
        .as_deref()
        .map(normalize_package_family);
    device
        .profiles
        .iter()
        .find_map(|profile| {
            let executable_matches = foreground_executable.as_ref().is_some_and(|foreground| {
                profile
                    .executable_paths
                    .iter()
                    .map(|path| normalize_executable(path))
                    .any(|path| path == *foreground)
            });
            let package_matches = foreground_package.as_ref().is_some_and(|foreground| {
                profile
                    .package_family_names
                    .iter()
                    .map(|name| normalize_package_family(name))
                    .any(|name| name == *foreground)
            });
            (executable_matches || package_matches)
                .then(|| (profile.rate_hz, Some(profile.profile_id.clone())))
        })
        .or(Some((device.idle_rate_hz, None)))
}

fn set_rate_sync(device_id: &str, rate_hz: u32) -> IpcResult<RazerPollingApplyResult> {
    #[cfg(windows)]
    {
        let mut opened = open_transport_by_id(device_id)?;
        let slot = register_device(&opened.info)?;
        let _operation = lock(&slot.operation)?;
        let _busy = BusyGuard::new(&slot.busy);
        let device = lock(&slot.info)?.clone();
        let mut protocol = lock(&slot.protocol)?;
        let mut runtime = lock(&slot.runtime)?;
        set_rate_with_transport(
            &mut opened.transport,
            &mut protocol,
            &mut runtime,
            &device,
            rate_hz,
            &GlobalRecoveryRecorder,
        )
    }
    #[cfg(not(windows))]
    {
        let _ = (device_id, rate_hz);
        Err(error(
            "unsupported_platform",
            "Razer polling control is only available on Windows",
        ))
    }
}

fn restore_rate_sync(device_id: &str) -> IpcResult<RazerPollingApplyResult> {
    #[cfg(windows)]
    {
        let mut opened = open_transport_by_id(device_id)?;
        let slot = register_device(&opened.info)?;
        let _operation = lock(&slot.operation)?;
        let _busy = BusyGuard::new(&slot.busy);
        let device = lock(&slot.info)?.clone();
        let mut protocol = lock(&slot.protocol)?;
        let mut runtime = lock(&slot.runtime)?;
        restore_with_transport(
            &mut opened.transport,
            &mut protocol,
            &mut runtime,
            &device,
            &GlobalRecoveryRecorder,
        )
    }
    #[cfg(not(windows))]
    {
        let _ = device_id;
        Err(error(
            "unsupported_platform",
            "Razer polling control is only available on Windows",
        ))
    }
}

fn record_slot_error(device_id: &str, operation_error: &IpcError) {
    let Ok(slot) = slot_by_id(device_id) else {
        return;
    };
    let Ok(mut runtime) = slot.runtime.lock() else {
        return;
    };
    latch_failure(
        &mut runtime,
        operation_error,
        may_have_changed(operation_error),
    );
}

#[derive(Default)]
struct LatestForegroundState {
    latest: Option<usize>,
    stopped: bool,
}

#[derive(Default)]
struct LatestForegroundEvent {
    state: Mutex<LatestForegroundState>,
    changed: Condvar,
}

impl LatestForegroundEvent {
    fn reset(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.latest = None;
            state.stopped = false;
        }
    }

    fn publish(&self, hwnd: usize) {
        if hwnd == 0 {
            return;
        }
        if let Ok(mut state) = self.state.lock() {
            if state.stopped {
                return;
            }
            // Replacement, rather than an unbounded channel, coalesces bursts
            // to the most recent foreground window.
            state.latest = Some(hwnd);
            self.changed.notify_one();
        }
    }

    fn wait(&self) -> Option<usize> {
        let mut state = self.state.lock().ok()?;
        while state.latest.is_none() && !state.stopped {
            state = self.changed.wait(state).ok()?;
        }
        if state.stopped {
            None
        } else {
            state.latest.take()
        }
    }

    fn stop(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.stopped = true;
            state.latest = None;
            self.changed.notify_all();
        }
    }

    #[cfg(test)]
    fn take_pending(&self) -> Option<usize> {
        self.state.lock().ok()?.latest.take()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct AutoTarget {
    rate_hz: u32,
    profile_id: Option<String>,
}

#[derive(Default)]
struct TargetInboxState {
    active: Option<AutoTarget>,
    pending: Option<AutoTarget>,
    stopped: bool,
}

#[derive(Default)]
struct TargetInbox {
    state: Mutex<TargetInboxState>,
    changed: Condvar,
}

impl TargetInbox {
    fn submit(&self, target: AutoTarget) {
        if let Ok(mut state) = self.state.lock() {
            if state.stopped || state.pending.as_ref() == Some(&target) {
                return;
            }
            if state.active.as_ref() == Some(&target) {
                // The latest event returned to the target already in flight.
                // Drop any superseded pending target instead of scheduling a
                // redundant readback after the active operation completes.
                state.pending = None;
                return;
            }
            state.pending = Some(target);
            self.changed.notify_one();
        }
    }

    fn wait(&self) -> Option<AutoTarget> {
        let mut state = self.state.lock().ok()?;
        while state.pending.is_none() && !state.stopped {
            state = self.changed.wait(state).ok()?;
        }
        if state.stopped {
            None
        } else {
            let target = state.pending.take()?;
            state.active = Some(target.clone());
            Some(target)
        }
    }

    fn complete(&self, target: &AutoTarget) {
        if let Ok(mut state) = self.state.lock() {
            if state.active.as_ref() == Some(target) {
                state.active = None;
            }
        }
    }

    fn stop(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.stopped = true;
            state.active = None;
            state.pending = None;
            self.changed.notify_all();
        }
    }
}

struct TargetWorker {
    inbox: Arc<TargetInbox>,
    handle: thread::JoinHandle<()>,
}

static TARGET_WORKERS: OnceLock<Mutex<HashMap<String, TargetWorker>>> = OnceLock::new();

fn target_workers() -> &'static Mutex<HashMap<String, TargetWorker>> {
    TARGET_WORKERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn submit_auto_target(device_id: &str, target: AutoTarget) -> IpcResult<()> {
    if let Ok(slot) = slot_by_id(device_id) {
        let mut runtime = lock(&slot.runtime)?;
        if runtime.faulted {
            return Ok(());
        }
        if runtime.current_rate_hz == Some(target.rate_hz)
            && runtime.auto_target_rate_hz == Some(target.rate_hz)
        {
            runtime.active_profile_id = target.profile_id;
            return Ok(());
        }
    }

    let mut workers = lock(target_workers())?;
    if !workers.contains_key(device_id) {
        let inbox = Arc::new(TargetInbox::default());
        let worker_inbox = inbox.clone();
        let worker_device_id = device_id.to_string();
        let handle = thread::spawn(move || {
            while let Some(target) = worker_inbox.wait() {
                if let Ok(slot) = slot_by_id(&worker_device_id) {
                    if let Ok(runtime) = slot.runtime.lock() {
                        if runtime.faulted {
                            worker_inbox.complete(&target);
                            continue;
                        }
                        if runtime.current_rate_hz == Some(target.rate_hz)
                            && runtime.auto_target_rate_hz == Some(target.rate_hz)
                        {
                            drop(runtime);
                            if let Ok(mut runtime) = slot.runtime.lock() {
                                runtime.active_profile_id = target.profile_id.clone();
                            }
                            worker_inbox.complete(&target);
                            continue;
                        }
                    }
                }
                match set_rate_sync(&worker_device_id, target.rate_hz) {
                    Ok(result) => {
                        if let Ok(slot) = slot_by_id(&worker_device_id) {
                            if let Ok(mut runtime) = slot.runtime.lock() {
                                runtime.current_rate_hz = Some(result.current_rate_hz);
                                runtime.auto_target_rate_hz = Some(target.rate_hz);
                                runtime.active_profile_id = target.profile_id.clone();
                            }
                        }
                    }
                    Err(operation_error) => {
                        record_slot_error(&worker_device_id, &operation_error);
                    }
                }
                worker_inbox.complete(&target);
            }
        });
        workers.insert(device_id.to_string(), TargetWorker { inbox, handle });
    }
    if let Some(worker) = workers.get(device_id) {
        worker.inbox.submit(target);
    }
    Ok(())
}

fn stop_target_workers() {
    let workers = target_workers()
        .lock()
        .ok()
        .map(|mut workers| {
            workers
                .drain()
                .map(|(_, worker)| worker)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for worker in &workers {
        worker.inbox.stop();
    }
    for worker in workers {
        let _ = worker.handle.join();
    }
}

#[cfg(windows)]
static FOREGROUND_EVENTS: OnceLock<Arc<LatestForegroundEvent>> = OnceLock::new();
#[cfg(windows)]
static DEVICE_REFRESH_PENDING: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
fn foreground_events() -> &'static Arc<LatestForegroundEvent> {
    FOREGROUND_EVENTS.get_or_init(|| Arc::new(LatestForegroundEvent::default()))
}

#[cfg(windows)]
unsafe extern "system" fn foreground_event_callback(
    _hook: winapi::shared::windef::HWINEVENTHOOK,
    event: u32,
    hwnd: winapi::shared::windef::HWND,
    _object_id: i32,
    _child_id: i32,
    _event_thread: u32,
    _event_time: u32,
) {
    use winapi::um::winuser::EVENT_SYSTEM_FOREGROUND;
    if event == EVENT_SYSTEM_FOREGROUND && !hwnd.is_null() {
        foreground_events().publish(hwnd as usize);
    }
}

struct AutoRuntime {
    #[cfg(windows)]
    hook_thread_id: u32,
    hook_thread: thread::JoinHandle<()>,
    coordinator_thread: thread::JoinHandle<()>,
}

static AUTO_RUNTIME: OnceLock<Mutex<Option<AutoRuntime>>> = OnceLock::new();

fn auto_runtime() -> &'static Mutex<Option<AutoRuntime>> {
    AUTO_RUNTIME.get_or_init(|| Mutex::new(None))
}

#[cfg(windows)]
fn coordinate_foreground(hwnd: usize) {
    let foreground = windows::foreground_identity(hwnd);
    let config = controller()
        .lock()
        .ok()
        .and_then(|controller| controller.auto_config.clone());
    let Some(config) = config.filter(|config| config.enabled) else {
        return;
    };

    // Device enumeration belongs only to WM_DEVICECHANGE. Ordinary foreground
    // transitions resolve one process identity and never query HID topology.
    if DEVICE_REFRESH_PENDING.swap(false, Ordering::AcqRel) {
        match enumerate_transports() {
            Ok(opened) => {
                let _ = refresh_registry(&opened);
            }
            Err(_) => {
                // Keep one retry pending for the next real foreground event;
                // no timer or polling loop is introduced.
                DEVICE_REFRESH_PENDING.store(true, Ordering::Release);
            }
        }
    }
    for configured in &config.devices {
        let Ok(slot) = slot_by_id(&configured.device_id) else {
            continue;
        };
        if slot
            .runtime
            .lock()
            .map_or(true, |runtime| !runtime.connected)
        {
            continue;
        }
        if let Some((rate_hz, profile_id)) =
            target_for_device(&config, &configured.device_id, &foreground)
        {
            let _ = submit_auto_target(
                &configured.device_id,
                AutoTarget {
                    rate_hz,
                    profile_id,
                },
            );
        }
    }
}

#[cfg(windows)]
fn start_auto_worker() -> IpcResult<()> {
    use std::mem::zeroed;
    use std::ptr::null_mut;
    use std::sync::mpsc;
    use winapi::um::processthreadsapi::GetCurrentThreadId;
    use winapi::um::winuser::{
        DestroyWindow, DispatchMessageW, GetForegroundWindow, GetMessageW, PeekMessageW,
        SetWinEventHook, UnhookWinEvent, UnregisterDeviceNotification, EVENT_SYSTEM_FOREGROUND,
        MSG, PM_NOREMOVE, WINEVENT_OUTOFCONTEXT,
    };

    let mut runtime = lock(auto_runtime())?;
    if runtime.is_some() {
        return Ok(());
    }
    let events = foreground_events().clone();
    events.reset();
    let coordinator_events = events.clone();
    let coordinator_thread = thread::spawn(move || {
        while let Some(hwnd) = coordinator_events.wait() {
            coordinate_foreground(hwnd);
        }
    });

    let (ready_sender, ready_receiver) = mpsc::sync_channel::<Result<u32, String>>(1);
    let hook_thread = thread::spawn(move || {
        // GetMessageW needs a message queue on this exact thread; the hook is
        // registered and unregistered here so WinEvent lifecycle is ordered.
        let thread_id = unsafe { GetCurrentThreadId() };
        let (notification_window, device_notification) =
            match unsafe { windows::create_device_notification_window() } {
                Ok(registration) => registration,
                Err(message) => {
                    let _ = ready_sender.send(Err(message));
                    return;
                }
            };
        let hook = unsafe {
            SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                null_mut(),
                Some(foreground_event_callback),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            )
        };
        if hook.is_null() {
            unsafe {
                UnregisterDeviceNotification(device_notification);
                DestroyWindow(notification_window);
            }
            let _ = ready_sender.send(Err(format!(
                "SetWinEventHook failed with Win32 code {}",
                unsafe { winapi::um::errhandlingapi::GetLastError() }
            )));
            return;
        }
        let mut initial_message: MSG = unsafe { zeroed() };
        unsafe {
            PeekMessageW(&mut initial_message, null_mut(), 0, 0, PM_NOREMOVE);
        }
        let _ = ready_sender.send(Ok(thread_id));
        let foreground = unsafe { GetForegroundWindow() };
        if !foreground.is_null() {
            foreground_events().publish(foreground as usize);
        }
        let mut message: MSG = unsafe { zeroed() };
        loop {
            let result = unsafe { GetMessageW(&mut message, null_mut(), 0, 0) };
            if result <= 0 {
                break;
            }
            unsafe {
                DispatchMessageW(&message);
            }
        }
        unsafe {
            UnhookWinEvent(hook);
            UnregisterDeviceNotification(device_notification);
            DestroyWindow(notification_window);
        }
    });

    let hook_thread_id = match ready_receiver.recv() {
        Ok(Ok(thread_id)) => thread_id,
        Ok(Err(message)) => {
            events.stop();
            let _ = hook_thread.join();
            let _ = coordinator_thread.join();
            return Err(error("foreground_hook_failed", message));
        }
        Err(channel_error) => {
            events.stop();
            let _ = hook_thread.join();
            let _ = coordinator_thread.join();
            return Err(error(
                "foreground_hook_failed",
                format!("Foreground hook did not initialize: {channel_error}"),
            ));
        }
    };
    *runtime = Some(AutoRuntime {
        hook_thread_id,
        hook_thread,
        coordinator_thread,
    });
    Ok(())
}

#[cfg(not(windows))]
fn start_auto_worker() -> IpcResult<()> {
    Err(error(
        "unsupported_platform",
        "Razer polling control is only available on Windows",
    ))
}

fn stop_auto_worker() {
    let runtime = auto_runtime()
        .lock()
        .ok()
        .and_then(|mut runtime| runtime.take());
    #[cfg(windows)]
    foreground_events().stop();
    if let Some(runtime) = runtime {
        #[cfg(windows)]
        unsafe {
            winapi::um::winuser::PostThreadMessageW(
                runtime.hook_thread_id,
                winapi::um::winuser::WM_QUIT,
                0,
                0,
            );
        }
        let _ = runtime.hook_thread.join();
        let _ = runtime.coordinator_thread.join();
    }
    stop_target_workers();
}

#[tauri::command]
pub async fn razer_polling_probe<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> IpcResult<Vec<RazerPollingStatus>> {
    ensure_recovery_journal(&app)?;
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(windows)]
        {
            let opened = enumerate_transports()?;
            refresh_registry(&opened)?;
            for mut discovered in opened {
                let slot = register_device(&discovered.info)?;
                let _operation = lock(&slot.operation)?;
                let _busy = BusyGuard::new(&slot.busy);
                let device = lock(&slot.info)?.clone();
                let mut protocol = lock(&slot.protocol)?;
                let mut runtime = lock(&slot.runtime)?;
                match read_rate(&mut discovered.transport, &mut protocol) {
                    Ok(rate_hz) => {
                        if let Err(probe_error) = reconcile_successful_probe(
                            &mut runtime,
                            &device,
                            rate_hz,
                            &GlobalRecoveryRecorder,
                        ) {
                            latch_failure(&mut runtime, &probe_error, false);
                        }
                    }
                    Err(probe_error) => {
                        runtime.connected = true;
                        latch_failure(&mut runtime, &probe_error, false);
                    }
                }
            }
            snapshots()
        }
        #[cfg(not(windows))]
        {
            Err(error(
                "unsupported_platform",
                "Razer polling control is only available on Windows",
            ))
        }
    })
    .await
    .map_err(|join| error("worker_failed", join.to_string()))?
}

#[tauri::command]
pub async fn razer_polling_status() -> IpcResult<Vec<RazerPollingStatus>> {
    tauri::async_runtime::spawn_blocking(snapshots)
        .await
        .map_err(|join| error("worker_failed", join.to_string()))?
}

#[tauri::command]
pub async fn razer_polling_configure<R: Runtime>(
    app: tauri::AppHandle<R>,
    config: RazerPollingConfig,
) -> IpcResult<Vec<RazerPollingStatus>> {
    ensure_recovery_journal(&app)?;
    validate_config(&config)?;
    tauri::async_runtime::spawn_blocking(move || {
        stop_auto_worker();
        if !config.enabled {
            let device_ids = lock(controller())?
                .devices
                .iter()
                .filter_map(|(device_id, slot)| {
                    slot.runtime
                        .lock()
                        .ok()
                        .and_then(|runtime| runtime.baseline_rate_hz.map(|_| device_id.clone()))
                })
                .collect::<Vec<_>>();
            for device_id in device_ids {
                if let Err(restore_error) = restore_rate_sync(&device_id) {
                    record_slot_error(&device_id, &restore_error);
                }
            }
        }

        #[cfg(windows)]
        {
            if let Ok(opened) = enumerate_transports() {
                refresh_registry(&opened)?;
            }
        }
        {
            let mut controller = lock(controller())?;
            controller.auto_config = Some(config.clone());
            for slot in controller.devices.values() {
                let mut runtime = lock(&slot.runtime)?;
                runtime.auto_target_rate_hz = None;
                runtime.active_profile_id = None;
            }
        }
        if config.enabled {
            if let Err(hook_error) = start_auto_worker() {
                if let Ok(mut controller) = controller().lock() {
                    controller.auto_config = None;
                }
                return Err(hook_error);
            }
        }
        snapshots()
    })
    .await
    .map_err(|join| error("worker_failed", join.to_string()))?
}

#[tauri::command]
pub async fn razer_polling_set_rate<R: Runtime>(
    app: tauri::AppHandle<R>,
    device_id: String,
    rate_hz: u32,
) -> IpcResult<RazerPollingApplyResult> {
    ensure_recovery_journal(&app)?;
    tauri::async_runtime::spawn_blocking(move || set_rate_sync(&device_id, rate_hz))
        .await
        .map_err(|join| error("worker_failed", join.to_string()))?
}

#[tauri::command]
pub async fn razer_polling_restore<R: Runtime>(
    app: tauri::AppHandle<R>,
    device_id: String,
) -> IpcResult<RazerPollingApplyResult> {
    ensure_recovery_journal(&app)?;
    tauri::async_runtime::spawn_blocking(move || restore_rate_sync(&device_id))
        .await
        .map_err(|join| error("worker_failed", join.to_string()))?
}

#[tauri::command]
pub async fn razer_polling_verify_capabilities<R: Runtime>(
    app: tauri::AppHandle<R>,
    device_id: String,
) -> IpcResult<RazerPollingCapabilityResult> {
    ensure_recovery_journal(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let mut opened = open_transport_by_id(&device_id)?;
            let slot = register_device(&opened.info)?;
            let _operation = lock(&slot.operation)?;
            let _busy = BusyGuard::new(&slot.busy);
            let device = lock(&slot.info)?.clone();
            let mut protocol = lock(&slot.protocol)?;
            let mut runtime = lock(&slot.runtime)?;
            Ok(verify_capabilities_with_transport(
                &mut opened.transport,
                &mut protocol,
                &mut runtime,
                &device,
                &GlobalRecoveryRecorder,
            ))
        }
        #[cfg(not(windows))]
        {
            Err(error(
                "unsupported_platform",
                "Razer polling control is only available on Windows",
            ))
        }
    })
    .await
    .map_err(|join| error("worker_failed", join.to_string()))?
}

pub fn shutdown_and_restore() {
    stop_auto_worker();
    let device_ids = controller()
        .lock()
        .ok()
        .map(|controller| {
            controller
                .devices
                .iter()
                .filter_map(|(device_id, slot)| {
                    slot.runtime
                        .lock()
                        .ok()
                        .and_then(|runtime| runtime.baseline_rate_hz.map(|_| device_id.clone()))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for device_id in device_ids {
        let _ = restore_rate_sync(&device_id);
    }
    if let Ok(mut controller) = controller().lock() {
        controller.auto_config = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    enum FakeReply {
        Status(u8, u8),
        Error(&'static str),
    }

    struct FakeTransport {
        responses: VecDeque<FakeReply>,
        requests: Vec<[u8; REPORT_LENGTH]>,
        pending_request: Option<[u8; REPORT_LENGTH]>,
    }

    impl FakeTransport {
        fn new(responses: impl IntoIterator<Item = FakeReply>) -> Self {
            Self {
                responses: responses.into_iter().collect(),
                requests: Vec::new(),
                pending_request: None,
            }
        }
    }

    impl FeatureTransport for FakeTransport {
        fn send(&mut self, request: [u8; REPORT_LENGTH]) -> IpcResult<()> {
            self.requests.push(request);
            self.pending_request = Some(request);
            Ok(())
        }

        fn receive(&mut self) -> IpcResult<[u8; REPORT_LENGTH]> {
            let request = self.pending_request.expect("receive without request");
            match self.responses.pop_front().expect("unexpected request") {
                FakeReply::Status(status, value) => {
                    let mut response = request;
                    response[1] = status;
                    response[10] = value;
                    response[89] = checksum(&response);
                    Ok(response)
                }
                FakeReply::Error(reason) => Err(error(reason, "injected transport failure")),
            }
        }
    }

    #[derive(Default)]
    struct MemoryRecorder {
        entries: Mutex<BTreeMap<String, RecoveryEntry>>,
    }

    impl RecoveryRecorder for MemoryRecorder {
        fn entry(&self, device_id: &str) -> IpcResult<Option<RecoveryEntry>> {
            Ok(lock(&self.entries)?.get(device_id).cloned())
        }

        fn upsert(&self, entry: RecoveryEntry) -> IpcResult<()> {
            lock(&self.entries)?.insert(entry.device_id.clone(), entry);
            Ok(())
        }

        fn remove(&self, device_id: &str) -> IpcResult<()> {
            lock(&self.entries)?.remove(device_id);
            Ok(())
        }
    }

    fn device(id: &str) -> RazerPollingDevice {
        RazerPollingDevice {
            device_id: id.into(),
            identity_persistent: true,
            name: format!("Device {id}"),
            vendor_id: RAZER_VENDOR_ID,
            product_id: 0x00e6,
            connection: "wireless".into(),
        }
    }

    mod capability_verification {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../tests/rust/src-tauri/razer_polling_capability_verification.test.rs"
        ));
    }

    #[test]
    fn device_identity_uses_serial_container_instance_then_path() {
        let serial = select_device_identity(
            0x1532,
            0x00e6,
            Some("  serial-01  "),
            Some("11111111-2222-3333-4444-555555555555"),
            Some(r"HID\VID_1532&PID_00E6\INSTANCE"),
            r"\\?\hid#vid_1532&pid_00e6#path",
        );
        assert_eq!(serial.material, "serial:1532:00e6:SERIAL-01");
        assert!(serial.persistent);

        let container = select_device_identity(
            0x1532,
            0x00e6,
            Some(" "),
            Some("11111111-2222-3333-4444-555555555555"),
            Some(r"HID\VID_1532&PID_00E6\INSTANCE"),
            r"\\?\hid#vid_1532&pid_00e6#path",
        );
        assert_eq!(
            container.material,
            "container:1532:00e6:11111111-2222-3333-4444-555555555555"
        );
        assert!(container.persistent);

        let instance = select_device_identity(
            0x1532,
            0x00e6,
            None,
            None,
            Some(r"hid\vid_1532&pid_00e6\instance"),
            r"\\?\hid#vid_1532&pid_00e6#path",
        );
        assert_eq!(
            instance.material,
            r"instance:1532:00e6:HID\VID_1532&PID_00E6\INSTANCE"
        );
        assert!(instance.persistent);

        let path = select_device_identity(
            0x1532,
            0x00e6,
            None,
            None,
            None,
            r"\\?\hid#vid_1532&pid_00e6#path",
        );
        assert_eq!(
            path.material,
            r"path:1532:00e6:\\?\HID#VID_1532&PID_00E6#PATH"
        );
        assert!(!path.persistent);
    }

    #[test]
    fn opaque_device_id_is_deterministic_and_does_not_expose_identity() {
        let identity = "container:1532:00e6:11111111-2222-3333-4444-555555555555";
        let first = opaque_device_id(identity);
        assert_eq!(first, opaque_device_id(identity));
        assert_eq!(first.len(), 28);
        assert!(first.starts_with("rzr-"));
        assert!(!first.contains("11111111"));
        assert_ne!(first, opaque_device_id("instance:1532:00e6:HID\\OTHER"));
    }

    #[test]
    fn duplicate_persistent_identity_uses_distinct_non_persistent_path_hashes() {
        let primary = opaque_device_id("serial:1532:00e6:DUPLICATE");
        let first_path = opaque_device_id(r"path:1532:00e6:\\?\HID#FIRST");
        let second_path = opaque_device_id(r"path:1532:00e6:\\?\HID#SECOND");
        let first = resolve_duplicate_device_id(&primary, true, &first_path, 2);
        let second = resolve_duplicate_device_id(&primary, true, &second_path, 2);
        assert_eq!(first, (first_path, false));
        assert_eq!(second, (second_path, false));
        assert_ne!(first.0, second.0);

        assert_eq!(
            resolve_duplicate_device_id(&primary, true, "unused", 1),
            (primary, true)
        );
    }

    #[test]
    fn get_packet_checksum_excludes_transaction() {
        assert_eq!(request(0x08, COMMAND_GET_POLLING_RATE, 0)[89], 0xc3);
        assert_eq!(request(0xfe, COMMAND_GET_POLLING_RATE, 0)[89], 0xc3);
        assert_eq!(request(0x08, COMMAND_GET_POLLING_RATE, 0).len(), 91);
    }

    #[test]
    fn rate_codes_round_trip() {
        for rate in SUPPORTED_RATES {
            assert_eq!(code_to_rate(rate_to_code(rate).unwrap()), Some(rate));
        }
        assert_eq!(rate_to_code(333), None);
    }

    #[test]
    fn failed_initial_get_never_sends_set_or_captures_baseline() {
        let mut transport = FakeTransport::new([FakeReply::Status(4, 0)]);
        let mut protocol = ProtocolState::default();
        let mut runtime = DeviceRuntime::default();
        let recorder = MemoryRecorder::default();
        assert!(set_rate_with_transport(
            &mut transport,
            &mut protocol,
            &mut runtime,
            &device("a"),
            500,
            &recorder,
        )
        .is_err());
        assert_eq!(transport.requests.len(), 1);
        assert_eq!(transport.requests[0][8], COMMAND_GET_POLLING_RATE);
        assert_eq!(runtime.baseline_rate_hz, None);
        assert!(lock(&recorder.entries).unwrap().is_empty());
    }

    #[test]
    fn no_op_read_does_not_capture_a_baseline() {
        let mut transport = FakeTransport::new([FakeReply::Status(2, 0x08)]);
        let mut protocol = ProtocolState::default();
        let mut runtime = DeviceRuntime::default();
        let recorder = MemoryRecorder::default();
        let result = set_rate_with_transport(
            &mut transport,
            &mut protocol,
            &mut runtime,
            &device("a"),
            1000,
            &recorder,
        )
        .unwrap();
        assert!(!result.changed);
        assert_eq!(runtime.baseline_rate_hz, None);
        assert!(lock(&recorder.entries).unwrap().is_empty());
    }

    #[test]
    fn one_faulted_device_does_not_block_another_device_transport() {
        let recorder = MemoryRecorder::default();
        let mut bad_transport = FakeTransport::new([FakeReply::Status(4, 0)]);
        let mut bad_protocol = ProtocolState::default();
        let mut bad_runtime = DeviceRuntime::default();
        assert!(set_rate_with_transport(
            &mut bad_transport,
            &mut bad_protocol,
            &mut bad_runtime,
            &device("bad"),
            500,
            &recorder,
        )
        .is_err());
        assert!(bad_runtime.faulted);

        let mut good_transport = FakeTransport::new([
            FakeReply::Status(2, 0x08),
            FakeReply::Status(2, 0x10),
            FakeReply::Status(2, 0x10),
        ]);
        let mut good_protocol = ProtocolState::default();
        let mut good_runtime = DeviceRuntime::default();
        let result = set_rate_with_transport(
            &mut good_transport,
            &mut good_protocol,
            &mut good_runtime,
            &device("good"),
            500,
            &recorder,
        )
        .unwrap();
        assert_eq!(result.current_rate_hz, 500);
        assert!(!good_runtime.faulted);
    }

    #[test]
    fn ownership_guard_refuses_restore_after_external_change() {
        let recorder = MemoryRecorder::default();
        let tested_device = device("owned");
        let mut runtime = DeviceRuntime {
            baseline_rate_hz: Some(1000),
            last_confirmed_rate_hz: Some(500),
            ..DeviceRuntime::default()
        };
        recorder
            .upsert(recovery_entry(&tested_device, &runtime, None, false).unwrap())
            .unwrap();
        let mut protocol = ProtocolState::default();
        let mut transport = FakeTransport::new([FakeReply::Status(2, 0x20)]);
        let restore_error = restore_with_transport(
            &mut transport,
            &mut protocol,
            &mut runtime,
            &tested_device,
            &recorder,
        )
        .unwrap_err();
        assert_eq!(restore_error.code, "razer_polling.ownership_lost");
        assert_eq!(transport.requests.len(), 1);
        assert_eq!(transport.requests[0][8], COMMAND_GET_POLLING_RATE);
    }

    #[test]
    fn explicit_probe_confirms_a_journaled_pending_target_after_crash() {
        let recorder = MemoryRecorder::default();
        let tested_device = device("recover");
        recorder
            .upsert(RecoveryEntry {
                device_id: tested_device.device_id.clone(),
                identity_persistent: tested_device.identity_persistent,
                vendor_id: tested_device.vendor_id,
                product_id: tested_device.product_id,
                baseline_rate_hz: 1000,
                last_confirmed_rate_hz: 1000,
                intended_rate_hz: Some(2000),
                possibly_changed: true,
            })
            .unwrap();
        let mut runtime = DeviceRuntime {
            faulted: true,
            possibly_changed: true,
            ..DeviceRuntime::default()
        };
        reconcile_successful_probe(&mut runtime, &tested_device, 2000, &recorder).unwrap();
        assert_eq!(runtime.baseline_rate_hz, Some(1000));
        assert_eq!(runtime.last_confirmed_rate_hz, Some(2000));
        assert!(!runtime.faulted);
        let entry = recorder.entry("recover").unwrap().unwrap();
        assert_eq!(entry.last_confirmed_rate_hz, 2000);
        assert_eq!(entry.intended_rate_hz, None);
        assert!(!entry.possibly_changed);
    }

    #[test]
    fn foreground_queue_is_idle_without_events_and_coalesces_to_latest() {
        let events = LatestForegroundEvent::default();
        let transport = FakeTransport::new([]);
        assert_eq!(events.take_pending(), None);
        assert!(transport.requests.is_empty());
        events.publish(11);
        events.publish(22);
        assert_eq!(events.take_pending(), Some(22));
    }

    #[test]
    fn target_inbox_deduplicates_the_active_target_and_keeps_only_the_latest() {
        let inbox = TargetInbox::default();
        let active = AutoTarget {
            rate_hz: 4_000,
            profile_id: Some("apex".into()),
        };
        let other = AutoTarget {
            rate_hz: 1_000,
            profile_id: None,
        };

        inbox.submit(active.clone());
        assert_eq!(inbox.wait(), Some(active.clone()));

        inbox.submit(active.clone());
        assert_eq!(lock(&inbox.state).unwrap().pending.clone(), None);

        inbox.submit(other.clone());
        assert_eq!(
            lock(&inbox.state).unwrap().pending.clone(),
            Some(other.clone())
        );

        // A newer event returning to the in-flight target cancels the stale
        // pending target instead of scheduling another operation.
        inbox.submit(active.clone());
        assert_eq!(lock(&inbox.state).unwrap().pending.clone(), None);

        inbox.complete(&active);
        inbox.submit(other.clone());
        assert_eq!(inbox.wait(), Some(other));
    }

    #[test]
    fn target_matching_supports_paths_and_package_family_names() {
        let config = RazerPollingConfig {
            schema_version: CONFIG_SCHEMA_VERSION,
            enabled: true,
            devices: vec![RazerPollingDeviceConfig {
                device_id: "mouse".into(),
                idle_rate_hz: 1000,
                profiles: vec![RazerPollingProfile {
                    profile_id: "apex".into(),
                    display_name: "Apex Legends".into(),
                    executable_paths: vec![r"C:\Games\Apex.exe".into()],
                    package_family_names: vec!["Publisher.Apex_abc".into()],
                    rate_hz: 4000,
                }],
            }],
        };
        assert_eq!(
            target_for_device(
                &config,
                "mouse",
                &ForegroundIdentity {
                    executable_path: Some(r"c:/games/APEX.EXE".into()),
                    package_family_name: None,
                },
            ),
            Some((4000, Some("apex".into())))
        );
        assert_eq!(
            target_for_device(
                &config,
                "mouse",
                &ForegroundIdentity {
                    executable_path: None,
                    package_family_name: Some("publisher.apex_ABC".into()),
                },
            ),
            Some((4000, Some("apex".into())))
        );
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "requires an explicitly selected local Razer HID device"]
    fn hardware_probe_reads_all_current_rates_without_writing() {
        let opened = enumerate_transports().expect("compatible Razer HID interfaces");
        assert!(!opened.is_empty());
        for mut device in opened {
            let mut protocol = ProtocolState::default();
            let rate =
                read_rate(&mut device.transport, &mut protocol).expect("current polling rate");
            assert!(SUPPORTED_RATES.contains(&rate));
        }
    }
}
