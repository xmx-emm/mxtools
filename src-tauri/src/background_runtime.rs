use crate::ipc_error::{IpcError, IpcResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;

use crate::razer_polling::{razer_polling_status, RazerPollingStatus};

pub const BACKGROUND_RUNTIME_SCHEMA_VERSION: u32 = 1;
pub const BACKGROUND_RUNTIME_FILE_NAME: &str = "background-runtime.json";
pub const BACKGROUND_RUNTIME_DEV_FILE_NAME: &str = "background-runtime.dev.json";
const RAZER_VENDOR_ID: u16 = 0x1532;
pub const RAZER_SUPPORTED_RATES_HZ: [u32; 7] = [125, 250, 500, 1_000, 2_000, 4_000, 8_000];

const AUTOSTART_ARGUMENT: &str = "--autostart";
const MAX_HOTKEY_LENGTH: usize = 128;
const MAX_DELAY_MS: u32 = 60_000;
const MAX_OVERLAY_HIDE_SECONDS: u32 = 3_600;

static CONFIG_IO_LOCK: Mutex<()> = Mutex::new(());
static MAIN_WINDOW_LOCK: Mutex<()> = Mutex::new(());
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static PENDING_MAIN_EVENT_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static MAIN_WINDOW_READY: AtomicBool = AtomicBool::new(false);
static PENDING_MAIN_EVENTS: OnceLock<Mutex<Vec<PendingMainEvent>>> = OnceLock::new();
static RUNTIME_TRANSACTION_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Debug)]
struct PendingMainEvent {
    id: u64,
    event: String,
    payload: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LaunchMode {
    Interactive,
    Autostart,
}

impl LaunchMode {
    pub fn from_args<I, S>(args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        if args
            .into_iter()
            .any(|argument| argument.as_ref() == AUTOSTART_ARGUMENT)
        {
            Self::Autostart
        } else {
            Self::Interactive
        }
    }

    pub fn current() -> Self {
        Self::from_args(std::env::args())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum RuntimeLocale {
    #[default]
    #[serde(rename = "system")]
    System,
    #[serde(rename = "zh-CN")]
    ZhCn,
    #[serde(rename = "en-US")]
    EnUs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ApexQOcrEngine {
    #[default]
    Auto,
    Rapid,
    Win,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl NormalizedRect {
    fn showpos_default() -> Self {
        Self {
            x: 0.0,
            y: 0.038,
            w: 0.105,
            h: 0.028,
        }
    }

    fn ping_default() -> Self {
        Self {
            x: 0.529,
            y: 0.364,
            w: 0.115,
            h: 0.099,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexQOverlayPlacement {
    pub version: u32,
    pub monitor_name: Option<String>,
    pub monitor_width: u32,
    pub monitor_height: u32,
    pub rect: NormalizedRect,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ApexQBackgroundConfig {
    pub setup_done: bool,
    pub wizard_step: u32,
    pub screenshot_folder: String,
    pub hotkey: String,
    pub delay_ms: u32,
    pub enabled: bool,
    pub overlay_hide_sec: u32,
    pub overlay_opacity: f64,
    pub overlay_x: Option<f64>,
    pub overlay_y: Option<f64>,
    pub overlay_w: u32,
    pub overlay_h: u32,
    pub overlay_placement: Option<ApexQOverlayPlacement>,
    pub overlay_locked: bool,
    pub ocr_engine: ApexQOcrEngine,
    pub showpos_confirmed: bool,
    pub usage_confirmed: bool,
    pub showpos_roi: NormalizedRect,
    pub ping_roi: NormalizedRect,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, Value>,
}

impl Default for ApexQBackgroundConfig {
    fn default() -> Self {
        Self {
            setup_done: false,
            wizard_step: 0,
            screenshot_folder: String::new(),
            hotkey: "F12".to_string(),
            delay_ms: 500,
            enabled: false,
            overlay_hide_sec: 8,
            overlay_opacity: 0.42,
            overlay_x: None,
            overlay_y: None,
            overlay_w: 220,
            overlay_h: 124,
            overlay_placement: None,
            overlay_locked: true,
            ocr_engine: ApexQOcrEngine::Auto,
            showpos_confirmed: false,
            usage_confirmed: false,
            showpos_roi: NormalizedRect::showpos_default(),
            ping_roi: NormalizedRect::ping_default(),
            extensions: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RazerDevicePollingConfig {
    pub idle_rate_hz: u32,
    pub verified_rates_hz: Vec<u32>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, Value>,
}

impl Default for RazerDevicePollingConfig {
    fn default() -> Self {
        Self {
            idle_rate_hz: 1_000,
            verified_rates_hz: Vec::new(),
            extensions: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RazerGameMatcher {
    pub executable: Option<String>,
    pub package_family_name: Option<String>,
    pub source: Option<String>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RazerGamePollingConfig {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub user_edited: bool,
    pub matchers: Vec<RazerGameMatcher>,
    pub device_rates_hz: BTreeMap<String, u32>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RazerBackgroundConfig {
    pub enabled: bool,
    pub device_profiles: BTreeMap<String, RazerDevicePollingConfig>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub model_presets: BTreeMap<String, Vec<u32>>,
    pub games: Vec<RazerGamePollingConfig>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundRuntimeConfig {
    pub schema_version: u32,
    pub autostart: bool,
    pub beta_features_enabled: bool,
    pub locale: RuntimeLocale,
    #[serde(default)]
    pub apex_q: ApexQBackgroundConfig,
    #[serde(default)]
    pub razer: RazerBackgroundConfig,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, Value>,
}

impl Default for BackgroundRuntimeConfig {
    fn default() -> Self {
        Self {
            schema_version: BACKGROUND_RUNTIME_SCHEMA_VERSION,
            autostart: false,
            beta_features_enabled: false,
            locale: RuntimeLocale::System,
            apex_q: ApexQBackgroundConfig::default(),
            razer: RazerBackgroundConfig::default(),
            extensions: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BackgroundFeatureState {
    Disabled,
    BlockedByBeta,
    NotConfigured,
    Ready,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundRuntimeSnapshot {
    pub autostart_supported: bool,
    /// The state read back from the operating system, not merely the saved preference.
    pub autostart_enabled: bool,
    pub configured_autostart: bool,
    pub launch_mode: LaunchMode,
    pub apex_q_state: BackgroundFeatureState,
    pub razer_state: BackgroundFeatureState,
    pub config: BackgroundRuntimeConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundRuntimeRazerUpdate {
    pub snapshot: BackgroundRuntimeSnapshot,
    pub statuses: Vec<RazerPollingStatus>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MainWindowDisposition {
    Created,
    Focused,
}

#[derive(Debug, Clone)]
pub struct BackgroundRuntimeStore {
    path: PathBuf,
}

impl BackgroundRuntimeStore {
    pub fn new(app_data_dir: impl AsRef<Path>) -> Self {
        Self {
            path: background_runtime_path(app_data_dir),
        }
    }

    pub fn from_app<R: Runtime>(app: &AppHandle<R>) -> IpcResult<Self> {
        let app_data_dir = app.path().app_data_dir().map_err(|error| {
            runtime_error(
                "path_failed",
                "Failed to resolve the application data directory",
            )
            .with_detail("detail", error.to_string())
        })?;
        Ok(Self::new(app_data_dir))
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load(&self) -> IpcResult<BackgroundRuntimeConfig> {
        let _guard = lock_config_io()?;
        load_config_unlocked(&self.path)
    }

    #[allow(dead_code)]
    pub fn save(&self, config: &BackgroundRuntimeConfig) -> IpcResult<()> {
        validate_background_runtime_config(config)?;
        let _guard = lock_config_io()?;
        save_config_unlocked(&self.path, config)
    }

    /// Serializes future Apex Q and Razer config mutations with autostart
    /// transactions so one feature cannot overwrite another feature's update.
    #[allow(dead_code)]
    pub fn update<T>(
        &self,
        update: impl FnOnce(&mut BackgroundRuntimeConfig) -> IpcResult<T>,
    ) -> IpcResult<T> {
        let _guard = lock_config_io()?;
        let mut config = load_config_unlocked(&self.path)?;
        let output = update(&mut config)?;
        validate_background_runtime_config(&config)?;
        save_config_unlocked(&self.path, &config)?;
        Ok(output)
    }

    /// Keeps a debug build's independent config truthful without touching the
    /// Windows startup registration used by an installed release build.
    pub fn enforce_current_build_invariants(&self) -> IpcResult<BackgroundRuntimeConfig> {
        let _guard = lock_config_io()?;
        let config = load_config_unlocked(&self.path)?;
        #[cfg(debug_assertions)]
        {
            let mut config = config;
            if config.autostart {
                config.autostart = false;
                save_config_unlocked(&self.path, &config)?;
            }
            Ok(config)
        }
        #[cfg(not(debug_assertions))]
        {
            Ok(config)
        }
    }
}

pub trait AutostartControl {
    fn is_enabled(&self) -> Result<bool, String>;
    fn enable(&self) -> Result<(), String>;
    fn disable(&self) -> Result<(), String>;
}

pub struct TauriAutostartControl<'a, R: Runtime> {
    app: &'a AppHandle<R>,
}

impl<'a, R: Runtime> TauriAutostartControl<'a, R> {
    pub fn new(app: &'a AppHandle<R>) -> Self {
        Self { app }
    }
}

impl<R: Runtime> AutostartControl for TauriAutostartControl<'_, R> {
    fn is_enabled(&self) -> Result<bool, String> {
        self.app
            .autolaunch()
            .is_enabled()
            .map_err(|error| error.to_string())
    }

    fn enable(&self) -> Result<(), String> {
        self.app
            .autolaunch()
            .enable()
            .map_err(|error| error.to_string())
    }

    fn disable(&self) -> Result<(), String> {
        self.app
            .autolaunch()
            .disable()
            .map_err(|error| error.to_string())
    }
}

pub const fn autostart_supported() -> bool {
    cfg!(all(windows, not(debug_assertions)))
}

pub const fn background_runtime_file_name() -> &'static str {
    if cfg!(debug_assertions) {
        BACKGROUND_RUNTIME_DEV_FILE_NAME
    } else {
        BACKGROUND_RUNTIME_FILE_NAME
    }
}

pub fn background_runtime_path(app_data_dir: impl AsRef<Path>) -> PathBuf {
    app_data_dir.as_ref().join(background_runtime_file_name())
}

/// Removes only the legacy startup entry that points at the currently running
/// debug executable. An installed release uses a different path and is left
/// untouched.
#[cfg(all(windows, debug_assertions))]
pub fn cleanup_current_debug_autostart_registration() -> IpcResult<bool> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
    use winreg::RegKey;

    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const STARTUP_APPROVED_KEY: &str =
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    const VALUE_NAME: &str = "mxtools";

    let current_exe = std::env::current_exe().map_err(|error| {
        runtime_error(
            "debug_autostart_cleanup_failed",
            "Failed to resolve the current debug executable",
        )
        .with_detail("detail", error.to_string())
    })?;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run = hkcu
        .open_subkey_with_flags(RUN_KEY, KEY_READ | KEY_SET_VALUE)
        .map_err(|error| {
            runtime_error(
                "debug_autostart_cleanup_failed",
                "Failed to open the Windows autostart registry key",
            )
            .with_detail("detail", error.to_string())
        })?;
    let command = match run.get_value::<String, _>(VALUE_NAME) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => {
            return Err(runtime_error(
                "debug_autostart_cleanup_failed",
                "Failed to read the Windows autostart entry",
            )
            .with_detail("detail", error.to_string()));
        }
    };
    if !registration_targets_executable(&command, &current_exe) {
        return Ok(false);
    }
    run.delete_value(VALUE_NAME).map_err(|error| {
        runtime_error(
            "debug_autostart_cleanup_failed",
            "Failed to remove the legacy debug autostart entry",
        )
        .with_detail("detail", error.to_string())
    })?;
    if let Ok(approved) =
        hkcu.open_subkey_with_flags(STARTUP_APPROVED_KEY, KEY_READ | KEY_SET_VALUE)
    {
        let _ = approved.delete_value(VALUE_NAME);
    }
    Ok(true)
}

#[cfg(all(windows, debug_assertions))]
fn registration_targets_executable(command: &str, executable: &Path) -> bool {
    let trimmed = command.trim();
    let candidate = if let Some(rest) = trimmed.strip_prefix('"') {
        rest.split_once('"').map(|(path, _)| path)
    } else {
        let lower = trimmed.to_ascii_lowercase();
        lower
            .find(".exe")
            .map(|index| &trimmed[..index.saturating_add(4)])
    };
    let Some(candidate) = candidate else {
        return false;
    };
    normalize_windows_path(candidate) == normalize_windows_path(&executable.to_string_lossy())
}

#[cfg(all(windows, debug_assertions))]
fn normalize_windows_path(value: &str) -> String {
    value
        .trim()
        .trim_start_matches(r"\\?\")
        .replace('/', r"\")
        .to_ascii_lowercase()
}

/// Creates the configured main WebView only when an interactive action needs
/// it. Repeated tray and single-instance requests focus the existing window.
pub fn ensure_main_window<R: Runtime>(app: &AppHandle<R>) -> IpcResult<MainWindowDisposition> {
    let _guard = MAIN_WINDOW_LOCK.lock().map_err(|_| {
        runtime_error(
            "main_window_lock_poisoned",
            "The main-window lifecycle lock is unavailable",
        )
    })?;
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        focus_main_window(&window)?;
        return Ok(MainWindowDisposition::Focused);
    }
    build_main_window(app)
}

/// Delivers a command to the main WebView after it has installed its event
/// listeners. This keeps tray actions reliable when the UI was just recreated.
pub fn request_main_window_event<R: Runtime, P: Serialize>(
    app: &AppHandle<R>,
    event: &str,
    payload: P,
) -> IpcResult<MainWindowDisposition> {
    let payload = serde_json::to_value(payload).map_err(|error| {
        runtime_error(
            "main_window_event_invalid",
            "Failed to serialize a pending main-window event",
        )
        .with_detail("detail", error.to_string())
    })?;
    let _guard = MAIN_WINDOW_LOCK.lock().map_err(|_| {
        runtime_error(
            "main_window_lock_poisoned",
            "The main-window lifecycle lock is unavailable",
        )
    })?;
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        focus_main_window(&window)?;
        if MAIN_WINDOW_READY.load(Ordering::Acquire) {
            window
                .emit(event, payload)
                .map_err(main_window_event_error)?;
        } else {
            queue_main_window_event(event, payload)?;
        }
        return Ok(MainWindowDisposition::Focused);
    }

    let pending_id = queue_main_window_event(event, payload)?;
    match build_main_window(app) {
        Ok(disposition) => Ok(disposition),
        Err(error) => {
            remove_pending_main_window_event(pending_id);
            Err(error)
        }
    }
}

fn build_main_window<R: Runtime>(app: &AppHandle<R>) -> IpcResult<MainWindowDisposition> {
    MAIN_WINDOW_READY.store(false, Ordering::Release);
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == MAIN_WINDOW_LABEL)
        .or_else(|| app.config().app.windows.first())
        .cloned()
        .ok_or_else(|| {
            runtime_error(
                "main_window_config_missing",
                "The Tauri main-window configuration is missing",
            )
        })?;
    let window = WebviewWindowBuilder::from_config(app, &config)
        .map_err(main_window_error)?
        .on_new_window(|url, _features| {
            if url.scheme() == "http" || url.scheme() == "https" {
                let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .on_page_load(|_, load| {
            if load.event() == PageLoadEvent::Started {
                MAIN_WINDOW_READY.store(false, Ordering::Release);
            }
        })
        .build()
        .map_err(main_window_error)?;
    focus_main_window(&window)?;
    Ok(MainWindowDisposition::Created)
}

fn focus_main_window<R: Runtime>(window: &WebviewWindow<R>) -> IpcResult<()> {
    window.unminimize().map_err(main_window_error)?;
    window.show().map_err(main_window_error)?;
    window.set_focus().map_err(main_window_error)
}

fn pending_main_events() -> &'static Mutex<Vec<PendingMainEvent>> {
    PENDING_MAIN_EVENTS.get_or_init(|| Mutex::new(Vec::new()))
}

fn queue_main_window_event(event: &str, payload: Value) -> IpcResult<u64> {
    let id = PENDING_MAIN_EVENT_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    pending_main_events()
        .lock()
        .map_err(|_| {
            runtime_error(
                "main_window_event_queue_failed",
                "The pending main-window event queue is unavailable",
            )
        })?
        .push(PendingMainEvent {
            id,
            event: event.to_string(),
            payload,
        });
    Ok(id)
}

fn remove_pending_main_window_event(id: u64) {
    if let Ok(mut events) = pending_main_events().lock() {
        events.retain(|event| event.id != id);
    }
}

fn flush_pending_main_window_events<R: Runtime>(window: &WebviewWindow<R>) -> IpcResult<()> {
    let events = pending_main_events()
        .lock()
        .map_err(|_| {
            runtime_error(
                "main_window_event_queue_failed",
                "The pending main-window event queue is unavailable",
            )
        })
        .map(|mut events| std::mem::take(&mut *events))?;
    let mut events = events.into_iter();
    while let Some(event) = events.next() {
        if let Err(error) = window.emit(&event.event, event.payload.clone()) {
            let mut pending = vec![event];
            pending.extend(events);
            let mut queued = pending_main_events().lock().map_err(|_| {
                runtime_error(
                    "main_window_event_queue_failed",
                    "The pending main-window event queue is unavailable",
                )
                .with_detail("emitDetail", error.to_string())
            })?;
            pending.append(&mut queued);
            *queued = pending;
            return Err(main_window_event_error(error).with_detail("queued", true));
        }
    }
    Ok(())
}

/// Marks the main WebView ready only after its native-event listeners exist.
/// Queued tray commands are then delivered in their original order.
#[tauri::command]
pub fn background_runtime_main_window_ready<R: Runtime>(window: WebviewWindow<R>) -> IpcResult<()> {
    if window.label() != MAIN_WINDOW_LABEL {
        return Err(runtime_error(
            "main_window_ready_invalid_caller",
            "Only the main window can mark the main WebView ready",
        ));
    }
    let _guard = MAIN_WINDOW_LOCK.lock().map_err(|_| {
        runtime_error(
            "main_window_lock_poisoned",
            "The main-window lifecycle lock is unavailable",
        )
    })?;
    if let Err(error) = flush_pending_main_window_events(&window) {
        MAIN_WINDOW_READY.store(false, Ordering::Release);
        return Err(error);
    }
    MAIN_WINDOW_READY.store(true, Ordering::Release);
    Ok(())
}

/// Destroys the main WebView after the frontend has resolved any dirty-edit
/// confirmation. The native coordinator and tray remain alive.
#[tauri::command]
pub fn destroy_main_window<R: Runtime>(app: AppHandle<R>) -> IpcResult<bool> {
    let _guard = MAIN_WINDOW_LOCK.lock().map_err(|_| {
        runtime_error(
            "main_window_lock_poisoned",
            "The main-window lifecycle lock is unavailable",
        )
    })?;
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        MAIN_WINDOW_READY.store(false, Ordering::Release);
        return Ok(false);
    };
    window.destroy().map_err(main_window_error)?;
    MAIN_WINDOW_READY.store(false, Ordering::Release);
    Ok(true)
}

pub fn validate_background_runtime_config(config: &BackgroundRuntimeConfig) -> IpcResult<()> {
    if config.schema_version != BACKGROUND_RUNTIME_SCHEMA_VERSION {
        return Err(runtime_error(
            "unsupported_schema",
            format!(
                "Unsupported background runtime schema version: {}",
                config.schema_version
            ),
        ));
    }

    validate_apex_q(&config.apex_q)?;
    validate_razer(&config.razer)?;
    Ok(())
}

pub fn background_runtime_snapshot_with<C: AutostartControl>(
    store: &BackgroundRuntimeStore,
    autostart: &C,
    launch_mode: LaunchMode,
) -> IpcResult<BackgroundRuntimeSnapshot> {
    let config = store.enforce_current_build_invariants()?;
    snapshot_for_support(config, autostart, launch_mode, autostart_supported())
}

pub fn background_runtime_set_autostart_with<C: AutostartControl>(
    store: &BackgroundRuntimeStore,
    autostart: &C,
    enabled: bool,
    launch_mode: LaunchMode,
) -> IpcResult<BackgroundRuntimeSnapshot> {
    set_autostart_for_support(
        store,
        autostart,
        enabled,
        launch_mode,
        autostart_supported(),
    )
}

#[tauri::command]
pub async fn background_runtime_get<R: Runtime>(
    app: AppHandle<R>,
) -> IpcResult<BackgroundRuntimeSnapshot> {
    let _transaction = runtime_transaction_lock().lock().await;
    let store = BackgroundRuntimeStore::from_app(&app)?;
    let autostart = TauriAutostartControl::new(&app);
    background_runtime_snapshot_with(&store, &autostart, LaunchMode::current())
}

#[tauri::command]
pub async fn background_runtime_set_autostart<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
) -> IpcResult<BackgroundRuntimeSnapshot> {
    let _transaction = runtime_transaction_lock().lock().await;
    let store = BackgroundRuntimeStore::from_app(&app)?;
    let autostart = TauriAutostartControl::new(&app);
    let snapshot =
        background_runtime_set_autostart_with(&store, &autostart, enabled, LaunchMode::current())?;
    // The OS registration can have drifted while the persisted preference did
    // not, so always publish the verified readback after an explicit request.
    emit_background_runtime_changed_if(&app, true, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub async fn background_runtime_configure<R: Runtime>(
    app: AppHandle<R>,
    mut config: BackgroundRuntimeConfig,
) -> IpcResult<BackgroundRuntimeSnapshot> {
    let _transaction = runtime_transaction_lock().lock().await;
    let store = BackgroundRuntimeStore::from_app(&app)?;
    let current = store.load()?;
    // The OS-backed setting can only be changed through
    // background_runtime_set_autostart, which verifies and rolls back.
    config.autostart = current.autostart;
    validate_background_runtime_config(&config)?;

    let autostart = TauriAutostartControl::new(&app);
    let launch_mode = LaunchMode::current();
    let initial_snapshot = snapshot_for_support(
        current.clone(),
        &autostart,
        launch_mode,
        autostart_supported(),
    )?;

    if config == current {
        return Ok(initial_snapshot);
    }

    if let Err(error) = crate::background_coordinator::apply_runtime_config(&app, &config).await {
        let rollback = crate::background_coordinator::apply_runtime_config(&app, &current).await;
        return Err(with_runtime_config_rollback(error, rollback));
    }

    let committed = store.update(|stored| {
        config.autostart = stored.autostart;
        *stored = config.clone();
        Ok(config.clone())
    });
    let config = match committed {
        Ok(config) => config,
        Err(error) => {
            let rollback =
                crate::background_coordinator::apply_runtime_config(&app, &current).await;
            return Err(with_runtime_config_rollback(
                runtime_error(
                    "config_commit_failed",
                    "The runtime changed but its background configuration could not be saved",
                )
                .with_detail("detail", error.to_string()),
                rollback,
            ));
        }
    };

    let snapshot = snapshot_from_known_state(
        config,
        initial_snapshot.autostart_enabled,
        launch_mode,
        initial_snapshot.autostart_supported,
    );
    emit_background_runtime_changed_if(&app, true, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub async fn background_runtime_update_apex_q<R: Runtime>(
    app: AppHandle<R>,
    apex_q: ApexQBackgroundConfig,
) -> IpcResult<BackgroundRuntimeSnapshot> {
    let _transaction = runtime_transaction_lock().lock().await;
    let store = BackgroundRuntimeStore::from_app(&app)?;
    let current = store.load()?;
    let mut desired = current.clone();
    desired.apex_q = apex_q.clone();
    validate_background_runtime_config(&desired)?;

    let autostart = TauriAutostartControl::new(&app);
    let launch_mode = LaunchMode::current();
    let initial_snapshot = snapshot_for_support(
        current.clone(),
        &autostart,
        launch_mode,
        autostart_supported(),
    )?;
    if desired.apex_q == current.apex_q {
        return Ok(initial_snapshot);
    }

    if let Err(error) = crate::background_coordinator::apply_apex_q_runtime_config(&app, &desired) {
        let rollback = crate::background_coordinator::apply_apex_q_runtime_config(&app, &current);
        return Err(with_runtime_config_rollback(error, rollback));
    }
    let config = match commit_apex_q_config(&store, apex_q) {
        Ok(config) => config,
        Err(error) => {
            let rollback =
                crate::background_coordinator::apply_apex_q_runtime_config(&app, &current);
            return Err(with_runtime_config_rollback(
                runtime_error(
                    "config_commit_failed",
                    "The Apex Q runtime changed but its background configuration could not be saved",
                )
                .with_detail("detail", error.to_string()),
                rollback,
            ));
        }
    };
    let snapshot = snapshot_from_known_state(
        config,
        initial_snapshot.autostart_enabled,
        launch_mode,
        initial_snapshot.autostart_supported,
    );
    emit_background_runtime_changed_if(&app, true, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub async fn background_runtime_set_beta_features<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
) -> IpcResult<BackgroundRuntimeSnapshot> {
    let _transaction = runtime_transaction_lock().lock().await;
    let store = BackgroundRuntimeStore::from_app(&app)?;
    let current = store.load()?;
    let mut desired = current.clone();
    desired.beta_features_enabled = enabled;

    let autostart = TauriAutostartControl::new(&app);
    let launch_mode = LaunchMode::current();
    let initial_snapshot = snapshot_for_support(
        current.clone(),
        &autostart,
        launch_mode,
        autostart_supported(),
    )?;
    if desired.beta_features_enabled == current.beta_features_enabled {
        return Ok(initial_snapshot);
    }

    if let Err(error) = crate::background_coordinator::apply_runtime_config(&app, &desired).await {
        let rollback = crate::background_coordinator::apply_runtime_config(&app, &current).await;
        return Err(with_runtime_config_rollback(error, rollback));
    }
    let config = match commit_beta_features(&store, enabled) {
        Ok(config) => config,
        Err(error) => {
            let rollback =
                crate::background_coordinator::apply_runtime_config(&app, &current).await;
            return Err(with_runtime_config_rollback(
                runtime_error(
                    "config_commit_failed",
                    "The Beta runtime changed but its background configuration could not be saved",
                )
                .with_detail("detail", error.to_string()),
                rollback,
            ));
        }
    };
    let snapshot = snapshot_from_known_state(
        config,
        initial_snapshot.autostart_enabled,
        launch_mode,
        initial_snapshot.autostart_supported,
    );
    emit_background_runtime_changed_if(&app, true, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub async fn background_runtime_update_razer<R: Runtime>(
    app: AppHandle<R>,
    razer: RazerBackgroundConfig,
) -> IpcResult<BackgroundRuntimeRazerUpdate> {
    let _transaction = runtime_transaction_lock().lock().await;
    let store = BackgroundRuntimeStore::from_app(&app)?;
    let current = store.load()?;
    let mut desired = current.clone();
    desired.razer = razer.clone();
    validate_background_runtime_config(&desired)?;

    let autostart = TauriAutostartControl::new(&app);
    let launch_mode = LaunchMode::current();
    let initial_snapshot = snapshot_for_support(
        current.clone(),
        &autostart,
        launch_mode,
        autostart_supported(),
    )?;

    if desired.razer == current.razer {
        return Ok(BackgroundRuntimeRazerUpdate {
            snapshot: initial_snapshot,
            statuses: razer_polling_status().await?,
        });
    }

    let statuses =
        match crate::background_coordinator::apply_razer_runtime_config(&app, &desired).await {
            Ok(statuses) => statuses,
            Err(error) => {
                let rollback =
                    crate::background_coordinator::apply_razer_runtime_config(&app, &current)
                        .await
                        .map(|_| ());
                return Err(with_runtime_config_rollback(error, rollback));
            }
        };

    let committed = commit_razer_config(&store, razer);
    let config = match committed {
        Ok(config) => config,
        Err(error) => {
            let rollback =
                crate::background_coordinator::apply_razer_runtime_config(&app, &current)
                    .await
                    .map(|_| ());
            return Err(with_runtime_config_rollback(
                runtime_error(
                    "config_commit_failed",
                    "The Razer runtime changed but its background configuration could not be saved",
                )
                .with_detail("detail", error.to_string()),
                rollback,
            ));
        }
    };
    let snapshot = snapshot_from_known_state(
        config,
        initial_snapshot.autostart_enabled,
        launch_mode,
        initial_snapshot.autostart_supported,
    );
    emit_background_runtime_changed_if(&app, true, &snapshot);
    Ok(BackgroundRuntimeRazerUpdate { snapshot, statuses })
}

#[tauri::command]
pub async fn background_runtime_set_locale<R: Runtime>(
    app: AppHandle<R>,
    locale: RuntimeLocale,
) -> IpcResult<BackgroundRuntimeSnapshot> {
    let _transaction = runtime_transaction_lock().lock().await;
    let store = BackgroundRuntimeStore::from_app(&app)?;
    let current = store.load()?;
    let autostart = TauriAutostartControl::new(&app);
    let launch_mode = LaunchMode::current();
    let initial_snapshot = snapshot_for_support(
        current.clone(),
        &autostart,
        launch_mode,
        autostart_supported(),
    )?;
    if current.locale == locale {
        return Ok(initial_snapshot);
    }

    if let Err(error) = crate::background_coordinator::apply_runtime_locale(&app, locale) {
        let rollback = crate::background_coordinator::apply_runtime_locale(&app, current.locale);
        return Err(with_runtime_config_rollback(error, rollback));
    }
    let config = match commit_runtime_locale(&store, locale) {
        Ok(config) => config,
        Err(error) => {
            let rollback =
                crate::background_coordinator::apply_runtime_locale(&app, current.locale);
            return Err(with_runtime_config_rollback(
                runtime_error(
                    "config_commit_failed",
                    "The runtime locale changed but its background configuration could not be saved",
                )
                .with_detail("detail", error.to_string()),
                rollback,
            ));
        }
    };
    let snapshot = snapshot_from_known_state(
        config,
        initial_snapshot.autostart_enabled,
        launch_mode,
        initial_snapshot.autostart_supported,
    );
    emit_background_runtime_changed_if(&app, true, &snapshot);
    Ok(snapshot)
}

fn commit_razer_config(
    store: &BackgroundRuntimeStore,
    razer: RazerBackgroundConfig,
) -> IpcResult<BackgroundRuntimeConfig> {
    store.update(|stored| {
        stored.razer = razer;
        Ok(stored.clone())
    })
}

fn commit_apex_q_config(
    store: &BackgroundRuntimeStore,
    apex_q: ApexQBackgroundConfig,
) -> IpcResult<BackgroundRuntimeConfig> {
    store.update(|stored| {
        stored.apex_q = apex_q;
        Ok(stored.clone())
    })
}

fn commit_beta_features(
    store: &BackgroundRuntimeStore,
    enabled: bool,
) -> IpcResult<BackgroundRuntimeConfig> {
    store.update(|stored| {
        stored.beta_features_enabled = enabled;
        Ok(stored.clone())
    })
}

fn commit_runtime_locale(
    store: &BackgroundRuntimeStore,
    locale: RuntimeLocale,
) -> IpcResult<BackgroundRuntimeConfig> {
    store.update(|stored| {
        stored.locale = locale;
        Ok(stored.clone())
    })
}

fn emit_background_runtime_changed_if<R: Runtime>(
    app: &AppHandle<R>,
    changed: bool,
    snapshot: &BackgroundRuntimeSnapshot,
) {
    if changed {
        if let Err(error) = app.emit("background-runtime-changed", snapshot) {
            crate::log_error!("Failed to emit background-runtime-changed: {error}");
        }
    }
}

fn runtime_transaction_lock() -> &'static tokio::sync::Mutex<()> {
    RUNTIME_TRANSACTION_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

fn with_runtime_config_rollback(error: IpcError, rollback: IpcResult<()>) -> IpcError {
    match rollback {
        Ok(()) => error.with_detail("rollback", "restored"),
        Err(rollback_error) => error
            .with_detail("rollback", "failed")
            .with_detail("rollbackDetail", rollback_error.to_string()),
    }
}

fn snapshot_for_support<C: AutostartControl>(
    mut config: BackgroundRuntimeConfig,
    autostart: &C,
    launch_mode: LaunchMode,
    supported: bool,
) -> IpcResult<BackgroundRuntimeSnapshot> {
    let actual_autostart = if supported {
        autostart.is_enabled().map_err(|detail| {
            runtime_error(
                "autostart_query_failed",
                "Failed to read back the Windows autostart state",
            )
            .with_detail("detail", detail)
        })?
    } else {
        config.autostart = false;
        false
    };

    Ok(snapshot_from_known_state(
        config,
        actual_autostart,
        launch_mode,
        supported,
    ))
}

fn set_autostart_for_support<C: AutostartControl>(
    store: &BackgroundRuntimeStore,
    autostart: &C,
    enabled: bool,
    launch_mode: LaunchMode,
    supported: bool,
) -> IpcResult<BackgroundRuntimeSnapshot> {
    let _config_guard = lock_config_io()?;
    let mut config = load_config_unlocked(store.path())?;

    if !supported {
        if config.autostart {
            config.autostart = false;
            save_config_unlocked(store.path(), &config)?;
        }
        if enabled {
            return Err(runtime_error(
                "autostart_unsupported",
                "Autostart is disabled in debug builds",
            ));
        }
        return Ok(snapshot_from_known_state(config, false, launch_mode, false));
    }

    let original_system_state = autostart.is_enabled().map_err(|detail| {
        runtime_error(
            "autostart_query_failed",
            "Failed to read the existing Windows autostart state",
        )
        .with_detail("detail", detail)
    })?;

    let apply_result = if enabled {
        // Re-enable even when already registered so upgrades refresh the
        // executable path and the required --autostart argument.
        autostart.enable()
    } else if original_system_state {
        autostart.disable()
    } else {
        Ok(())
    };
    if let Err(detail) = apply_result {
        return Err(with_rollback_result(
            runtime_error(
                "autostart_apply_failed",
                "Failed to update the Windows autostart state",
            )
            .with_detail("detail", detail),
            autostart,
            original_system_state,
        ));
    }

    let verified = autostart.is_enabled().map_err(|detail| {
        with_rollback_result(
            runtime_error(
                "autostart_verify_failed",
                "Failed to verify the Windows autostart state",
            )
            .with_detail("detail", detail),
            autostart,
            original_system_state,
        )
    })?;
    if verified != enabled {
        return Err(with_rollback_result(
            runtime_error(
                "autostart_verify_failed",
                "Windows reported a different autostart state after the update",
            )
            .with_detail("expected", enabled)
            .with_detail("actual", verified),
            autostart,
            original_system_state,
        ));
    }

    config.autostart = enabled;
    if let Err(error) = save_config_unlocked(store.path(), &config) {
        return Err(with_rollback_result(
            runtime_error(
                "autostart_config_save_failed",
                "Autostart changed but the background runtime config could not be saved",
            )
            .with_detail("detail", error.to_string()),
            autostart,
            original_system_state,
        ));
    }

    Ok(snapshot_from_known_state(
        config,
        verified,
        launch_mode,
        true,
    ))
}

fn snapshot_from_known_state(
    config: BackgroundRuntimeConfig,
    actual_autostart: bool,
    launch_mode: LaunchMode,
    supported: bool,
) -> BackgroundRuntimeSnapshot {
    let apex_q_state = if !config.apex_q.enabled {
        BackgroundFeatureState::Disabled
    } else if !config.beta_features_enabled {
        BackgroundFeatureState::BlockedByBeta
    } else if !config.apex_q.setup_done {
        BackgroundFeatureState::NotConfigured
    } else {
        BackgroundFeatureState::Ready
    };
    let razer_state = if !config.razer.enabled {
        BackgroundFeatureState::Disabled
    } else if !config.beta_features_enabled {
        BackgroundFeatureState::BlockedByBeta
    } else {
        BackgroundFeatureState::Ready
    };

    BackgroundRuntimeSnapshot {
        autostart_supported: supported,
        autostart_enabled: actual_autostart,
        configured_autostart: config.autostart,
        launch_mode,
        apex_q_state,
        razer_state,
        config,
    }
}

fn with_rollback_result<C: AutostartControl>(
    error: IpcError,
    autostart: &C,
    original_state: bool,
) -> IpcError {
    let rollback = if original_state {
        autostart.enable()
    } else {
        autostart.disable()
    };
    let rollback = rollback.and_then(|_| {
        let restored = autostart.is_enabled()?;
        if restored == original_state {
            Ok(())
        } else {
            Err(format!(
                "rollback readback mismatch: expected {original_state}, got {restored}"
            ))
        }
    });
    match rollback {
        Ok(()) => error.with_detail("rollback", "restored"),
        Err(detail) => error
            .with_detail("rollback", "failed")
            .with_detail("rollbackDetail", detail),
    }
}

fn validate_apex_q(config: &ApexQBackgroundConfig) -> IpcResult<()> {
    let hotkey = config.hotkey.trim();
    if hotkey.is_empty() || hotkey.len() > MAX_HOTKEY_LENGTH || hotkey.contains('\0') {
        return Err(invalid_config("Apex Q hotkey is invalid"));
    }
    if config.delay_ms > MAX_DELAY_MS {
        return Err(invalid_config("Apex Q capture delay is out of range"));
    }
    if config.overlay_hide_sec > MAX_OVERLAY_HIDE_SECONDS {
        return Err(invalid_config("Apex Q overlay timeout is out of range"));
    }
    if !config.overlay_opacity.is_finite() || !(0.15..=1.0).contains(&config.overlay_opacity) {
        return Err(invalid_config("Apex Q overlay opacity is out of range"));
    }
    if !(180..=640).contains(&config.overlay_w) || !(96..=480).contains(&config.overlay_h) {
        return Err(invalid_config("Apex Q overlay size is out of range"));
    }
    if config.overlay_x.is_some_and(|value| !value.is_finite())
        || config.overlay_y.is_some_and(|value| !value.is_finite())
    {
        return Err(invalid_config("Apex Q overlay position is invalid"));
    }
    validate_normalized_rect(&config.showpos_roi, "showpos ROI")?;
    validate_normalized_rect(&config.ping_roi, "ping ROI")?;
    if let Some(placement) = &config.overlay_placement {
        if placement.version != 2 || placement.monitor_width == 0 || placement.monitor_height == 0 {
            return Err(invalid_config("Apex Q overlay placement is invalid"));
        }
        validate_normalized_rect(&placement.rect, "overlay placement")?;
    }
    for deprecated in ["autostart", "closeToTray", "startInTray"] {
        if config.extensions.contains_key(deprecated) {
            return Err(invalid_config(format!(
                "Deprecated Apex Q field must be migrated: {deprecated}"
            )));
        }
    }
    Ok(())
}

fn validate_razer(config: &RazerBackgroundConfig) -> IpcResult<()> {
    for (device_id, profile) in &config.device_profiles {
        if device_id.trim().is_empty() || device_id.len() > 256 {
            return Err(invalid_config("Razer device ID is invalid"));
        }
        validate_razer_rate(profile.idle_rate_hz)?;
        let mut rates = HashSet::new();
        for rate in &profile.verified_rates_hz {
            validate_razer_rate(*rate)?;
            if !rates.insert(*rate) {
                return Err(invalid_config(format!(
                    "Razer device {device_id} contains duplicate verified rates"
                )));
            }
        }
    }

    for (model_key, verified_rates_hz) in &config.model_presets {
        if !valid_razer_model_key(model_key) || verified_rates_hz.is_empty() {
            return Err(invalid_config("Razer model preset is invalid"));
        }
        let mut rates = HashSet::new();
        for rate in verified_rates_hz {
            validate_razer_rate(*rate)?;
            if !rates.insert(*rate) {
                return Err(invalid_config(format!(
                    "Razer model {model_key} contains duplicate verified rates"
                )));
            }
        }
    }

    let mut game_ids = HashSet::new();
    for game in &config.games {
        let id = game.id.trim();
        if id.is_empty() || id.len() > 256 || !game_ids.insert(id.to_ascii_lowercase()) {
            return Err(invalid_config("Razer game ID is empty or duplicated"));
        }
        if game.name.trim().is_empty() || game.name.len() > 512 {
            return Err(invalid_config(format!(
                "Razer game {id} has an invalid display name"
            )));
        }
        for matcher in &game.matchers {
            if !valid_optional_matcher(&matcher.executable)
                || !valid_optional_matcher(&matcher.package_family_name)
                || (matcher.executable.is_none() && matcher.package_family_name.is_none())
            {
                return Err(invalid_config(format!(
                    "Razer game {id} contains an invalid matcher"
                )));
            }
        }
        if game.enabled && game.matchers.is_empty() {
            return Err(invalid_config(format!(
                "Enabled Razer game {id} has no process matcher"
            )));
        }
        for (device_id, rate) in &game.device_rates_hz {
            if device_id.trim().is_empty() {
                return Err(invalid_config(format!(
                    "Razer game {id} contains an empty device ID"
                )));
            }
            validate_razer_rate(*rate)?;
        }
    }
    Ok(())
}

fn valid_razer_model_key(model_key: &str) -> bool {
    if model_key.len() != 9 || model_key.as_bytes().get(4) != Some(&b':') {
        return false;
    }
    let Ok(vendor_id) = u16::from_str_radix(&model_key[..4], 16) else {
        return false;
    };
    let Ok(product_id) = u16::from_str_radix(&model_key[5..], 16) else {
        return false;
    };
    vendor_id == RAZER_VENDOR_ID
        && product_id != 0
        && model_key == format!("{vendor_id:04x}:{product_id:04x}")
}

fn validate_razer_rate(rate: u32) -> IpcResult<()> {
    if RAZER_SUPPORTED_RATES_HZ.contains(&rate) {
        Ok(())
    } else {
        Err(invalid_config(format!(
            "Unsupported Razer polling rate: {rate}"
        )))
    }
}

fn valid_optional_matcher(value: &Option<String>) -> bool {
    value
        .as_ref()
        .is_none_or(|value| !value.trim().is_empty() && value.len() <= 32_767)
}

fn validate_normalized_rect(rect: &NormalizedRect, label: &str) -> IpcResult<()> {
    let values = [rect.x, rect.y, rect.w, rect.h];
    if values.iter().any(|value| !value.is_finite())
        || rect.x < 0.0
        || rect.y < 0.0
        || rect.w <= 0.0
        || rect.h <= 0.0
        || rect.x + rect.w > 1.000_001
        || rect.y + rect.h > 1.000_001
    {
        Err(invalid_config(format!("Apex Q {label} is invalid")))
    } else {
        Ok(())
    }
}

fn load_config_unlocked(path: &Path) -> IpcResult<BackgroundRuntimeConfig> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(BackgroundRuntimeConfig::default());
        }
        Err(error) => {
            return Err(runtime_error(
                "config_read_failed",
                "Failed to read the background runtime config",
            )
            .with_detail("path", path.display().to_string())
            .with_detail("detail", error.to_string()));
        }
    };

    let value: Value = serde_json::from_slice(&bytes).map_err(|error| {
        runtime_error(
            "config_parse_failed",
            "The background runtime config is not valid JSON",
        )
        .with_detail("path", path.display().to_string())
        .with_detail("detail", error.to_string())
    })?;
    let schema_version = value.get("schemaVersion").and_then(Value::as_u64);
    if schema_version != Some(u64::from(BACKGROUND_RUNTIME_SCHEMA_VERSION)) {
        return Err(runtime_error(
            "unsupported_schema",
            "The background runtime config uses an unsupported schema",
        )
        .with_detail(
            "schemaVersion",
            schema_version.map(Value::from).unwrap_or(Value::Null),
        ));
    }
    let config: BackgroundRuntimeConfig = serde_json::from_value(value).map_err(|error| {
        runtime_error(
            "config_parse_failed",
            "The background runtime config has invalid fields",
        )
        .with_detail("path", path.display().to_string())
        .with_detail("detail", error.to_string())
    })?;
    validate_background_runtime_config(&config)?;
    Ok(config)
}

fn save_config_unlocked(path: &Path, config: &BackgroundRuntimeConfig) -> IpcResult<()> {
    let mut bytes = serde_json::to_vec_pretty(config).map_err(|error| {
        runtime_error(
            "config_serialize_failed",
            "Failed to serialize the background runtime config",
        )
        .with_detail("detail", error.to_string())
    })?;
    bytes.push(b'\n');
    atomic_write(path, &bytes).map_err(|error| {
        runtime_error(
            "config_write_failed",
            "Failed to atomically save the background runtime config",
        )
        .with_detail("path", path.display().to_string())
        .with_detail("detail", error.to_string())
    })
}

fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temp = unique_temp_path(path);
    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        replace_file(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn unique_temp_path(path: &Path) -> PathBuf {
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("background-runtime.json");
    path.with_file_name(format!(
        ".{file_name}.{}.{}.tmp",
        std::process::id(),
        sequence
    ))
}

#[cfg(windows)]
fn replace_file(from: &Path, to: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::winbase::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};

    let mut from_wide: Vec<u16> = from.as_os_str().encode_wide().collect();
    from_wide.push(0);
    let mut to_wide: Vec<u16> = to.as_os_str().encode_wide().collect();
    to_wide.push(0);
    let moved = unsafe {
        MoveFileExW(
            from_wide.as_ptr(),
            to_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::rename(from, to)
}

fn lock_config_io() -> IpcResult<MutexGuard<'static, ()>> {
    CONFIG_IO_LOCK.lock().map_err(|_| {
        runtime_error(
            "config_lock_poisoned",
            "The background runtime config lock is unavailable",
        )
    })
}

fn invalid_config(message: impl Into<String>) -> IpcError {
    runtime_error("invalid_config", message)
}

fn main_window_error(error: tauri::Error) -> IpcError {
    runtime_error(
        "main_window_operation_failed",
        "The main application window operation failed",
    )
    .with_detail("detail", error.to_string())
}

fn main_window_event_error(error: tauri::Error) -> IpcError {
    runtime_error(
        "main_window_event_failed",
        "Failed to deliver an event to the main application window",
    )
    .with_detail("detail", error.to_string())
}

fn runtime_error(reason: &str, message: impl Into<String>) -> IpcError {
    IpcError::new(format!("background_runtime.{reason}"), message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDir(PathBuf);

    impl TestDir {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "mxtools-background-runtime-{label}-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[derive(Default)]
    struct FakeAutostart {
        enabled: Cell<bool>,
        calls: RefCell<Vec<&'static str>>,
        fail_enable: Cell<bool>,
        report_after_enable: Cell<Option<bool>>,
    }

    impl AutostartControl for FakeAutostart {
        fn is_enabled(&self) -> Result<bool, String> {
            self.calls.borrow_mut().push("is_enabled");
            Ok(self.enabled.get())
        }

        fn enable(&self) -> Result<(), String> {
            self.calls.borrow_mut().push("enable");
            if self.fail_enable.get() {
                return Err("injected enable failure".to_string());
            }
            self.enabled
                .set(self.report_after_enable.get().unwrap_or(true));
            Ok(())
        }

        fn disable(&self) -> Result<(), String> {
            self.calls.borrow_mut().push("disable");
            self.enabled.set(false);
            Ok(())
        }
    }

    #[test]
    fn launch_mode_requires_the_exact_autostart_argument() {
        assert_eq!(
            LaunchMode::from_args(["mxtools.exe", "--autostart"]),
            LaunchMode::Autostart
        );
        assert_eq!(
            LaunchMode::from_args(["mxtools.exe", "--autostart=false"]),
            LaunchMode::Interactive
        );
    }

    #[test]
    fn pending_main_window_events_are_removable_after_creation_failure() {
        let id = queue_main_window_event("test-event", Value::String("payload".to_string()))
            .expect("queue event");
        assert!(pending_main_events()
            .lock()
            .unwrap()
            .iter()
            .any(|event| event.id == id));
        remove_pending_main_window_event(id);
        assert!(!pending_main_events()
            .lock()
            .unwrap()
            .iter()
            .any(|event| event.id == id));
    }

    #[test]
    fn runtime_config_rollback_result_is_reported() {
        let restored =
            with_runtime_config_rollback(runtime_error("apply_failed", "apply failed"), Ok(()));
        assert_eq!(restored.details.unwrap()["rollback"], "restored");

        let failed = with_runtime_config_rollback(
            runtime_error("apply_failed", "apply failed"),
            Err(runtime_error("rollback_failed", "rollback failed")),
        );
        let details = failed.details.unwrap();
        assert_eq!(details["rollback"], "failed");
        assert!(details["rollbackDetail"]
            .as_str()
            .is_some_and(|detail| detail.contains("rollback failed")));
    }

    #[cfg(all(windows, debug_assertions))]
    #[test]
    fn debug_autostart_cleanup_matches_only_the_current_executable() {
        let current = Path::new(r"E:\tauri\mxtools\src-tauri\target\debug\mxtools.exe");
        assert!(registration_targets_executable(
            r"E:\tauri\mxtools\src-tauri\target\debug\mxtools.exe --autostart",
            current,
        ));
        assert!(registration_targets_executable(
            r#""E:\tauri\mxtools\src-tauri\target\debug\mxtools.exe" --autostart"#,
            current,
        ));
        assert!(!registration_targets_executable(
            r#""C:\Program Files\mxtools\mxtools.exe" --autostart"#,
            current,
        ));
    }

    #[test]
    fn missing_config_loads_defaults_without_creating_a_file() {
        let dir = TestDir::new("default");
        let store = BackgroundRuntimeStore::new(&dir.0);
        assert_eq!(store.load().unwrap(), BackgroundRuntimeConfig::default());
        assert!(!store.path().exists());
    }

    #[test]
    fn config_round_trip_uses_the_build_specific_file() {
        let dir = TestDir::new("roundtrip");
        let store = BackgroundRuntimeStore::new(&dir.0);
        let mut config = BackgroundRuntimeConfig {
            beta_features_enabled: true,
            locale: RuntimeLocale::ZhCn,
            ..Default::default()
        };
        config.apex_q.enabled = true;
        config.apex_q.setup_done = true;
        store.save(&config).unwrap();

        assert_eq!(store.load().unwrap(), config);
        assert_eq!(
            store.path().file_name().unwrap().to_string_lossy(),
            background_runtime_file_name()
        );
        assert!(fs::read_dir(&dir.0).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".tmp")));
    }

    #[test]
    fn partial_runtime_commits_preserve_unrelated_fields() {
        let dir = TestDir::new("partial-commit");
        let store = BackgroundRuntimeStore::new(&dir.0);
        let mut original = BackgroundRuntimeConfig {
            autostart: true,
            beta_features_enabled: true,
            locale: RuntimeLocale::ZhCn,
            ..Default::default()
        };
        original.apex_q.hotkey = "Ctrl+Alt+A".to_string();
        store.save(&original).unwrap();

        let mut razer = RazerBackgroundConfig {
            enabled: true,
            ..Default::default()
        };
        razer.device_profiles.insert(
            "device-a".to_string(),
            RazerDevicePollingConfig {
                idle_rate_hz: 500,
                ..Default::default()
            },
        );
        let after_razer = commit_razer_config(&store, razer.clone()).unwrap();
        assert_eq!(after_razer.razer, razer);
        assert!(after_razer.autostart);
        assert!(after_razer.beta_features_enabled);
        assert_eq!(after_razer.locale, RuntimeLocale::ZhCn);
        assert_eq!(after_razer.apex_q.hotkey, "Ctrl+Alt+A");

        let after_locale = commit_runtime_locale(&store, RuntimeLocale::EnUs).unwrap();
        assert_eq!(after_locale.locale, RuntimeLocale::EnUs);
        assert_eq!(after_locale.razer, razer);
        assert!(after_locale.autostart);
        assert!(after_locale.beta_features_enabled);
        assert_eq!(after_locale.apex_q.hotkey, "Ctrl+Alt+A");

        let mut apex_q = after_locale.apex_q.clone();
        apex_q.hotkey = "Ctrl+Alt+Q".to_string();
        let after_apex_q = commit_apex_q_config(&store, apex_q.clone()).unwrap();
        assert_eq!(after_apex_q.apex_q, apex_q);
        assert_eq!(after_apex_q.razer, razer);
        assert_eq!(after_apex_q.locale, RuntimeLocale::EnUs);
        assert!(after_apex_q.autostart);
        assert!(after_apex_q.beta_features_enabled);

        let after_beta = commit_beta_features(&store, false).unwrap();
        assert!(!after_beta.beta_features_enabled);
        assert_eq!(after_beta.apex_q, apex_q);
        assert_eq!(after_beta.razer, razer);
        assert_eq!(after_beta.locale, RuntimeLocale::EnUs);
        assert!(after_beta.autostart);
        assert_eq!(store.load().unwrap(), after_beta);
    }

    #[test]
    fn corrupt_and_unsupported_configs_are_not_replaced() {
        let dir = TestDir::new("corrupt");
        let store = BackgroundRuntimeStore::new(&dir.0);
        fs::write(store.path(), b"{not-json").unwrap();
        assert_eq!(
            store.load().unwrap_err().code,
            "background_runtime.config_parse_failed"
        );
        assert_eq!(fs::read(store.path()).unwrap(), b"{not-json");

        fs::write(store.path(), br#"{"schemaVersion":99}"#).unwrap();
        assert_eq!(
            store.load().unwrap_err().code,
            "background_runtime.unsupported_schema"
        );
    }

    #[test]
    fn validation_rejects_invalid_runtime_inputs() {
        let mut config = BackgroundRuntimeConfig::default();
        config.apex_q.hotkey.clear();
        assert_eq!(
            validate_background_runtime_config(&config)
                .unwrap_err()
                .code,
            "background_runtime.invalid_config"
        );

        let mut config = BackgroundRuntimeConfig::default();
        config.razer.device_profiles.insert(
            "device-a".to_string(),
            RazerDevicePollingConfig {
                idle_rate_hz: 333,
                ..Default::default()
            },
        );
        assert_eq!(
            validate_background_runtime_config(&config)
                .unwrap_err()
                .code,
            "background_runtime.invalid_config"
        );
    }

    #[test]
    fn unsupported_build_never_touches_the_autostart_backend() {
        let dir = TestDir::new("unsupported");
        let store = BackgroundRuntimeStore::new(&dir.0);
        let backend = FakeAutostart::default();
        let stale_config = BackgroundRuntimeConfig {
            autostart: true,
            ..Default::default()
        };
        store.save(&stale_config).unwrap();

        let snapshot =
            snapshot_for_support(stale_config, &backend, LaunchMode::Interactive, false).unwrap();
        assert!(!snapshot.autostart_supported);
        assert!(!snapshot.autostart_enabled);
        assert!(backend.calls.borrow().is_empty());

        let error =
            set_autostart_for_support(&store, &backend, true, LaunchMode::Interactive, false)
                .unwrap_err();
        assert_eq!(error.code, "background_runtime.autostart_unsupported");
        assert!(backend.calls.borrow().is_empty());
        assert!(!store.load().unwrap().autostart);
    }

    #[test]
    fn supported_autostart_is_applied_verified_and_saved() {
        let dir = TestDir::new("enable");
        let store = BackgroundRuntimeStore::new(&dir.0);
        let backend = FakeAutostart::default();
        let snapshot =
            set_autostart_for_support(&store, &backend, true, LaunchMode::Interactive, true)
                .unwrap();

        assert!(snapshot.autostart_enabled);
        assert!(snapshot.configured_autostart);
        assert!(store.load().unwrap().autostart);
        assert_eq!(
            backend.calls.borrow().as_slice(),
            ["is_enabled", "enable", "is_enabled"]
        );
    }

    #[test]
    fn failed_autostart_readback_rolls_back_and_preserves_config() {
        let dir = TestDir::new("rollback");
        let store = BackgroundRuntimeStore::new(&dir.0);
        let backend = FakeAutostart::default();
        backend.report_after_enable.set(Some(false));
        let error =
            set_autostart_for_support(&store, &backend, true, LaunchMode::Interactive, true)
                .unwrap_err();

        assert_eq!(error.code, "background_runtime.autostart_verify_failed");
        assert!(!backend.enabled.get());
        assert!(!store.load().unwrap().autostart);
        assert_eq!(error.details.unwrap()["rollback"], "restored");
    }

    #[cfg(debug_assertions)]
    #[test]
    fn debug_invariant_clears_only_the_dev_config_preference() {
        let dir = TestDir::new("debug-invariant");
        let store = BackgroundRuntimeStore::new(&dir.0);
        let config = BackgroundRuntimeConfig {
            autostart: true,
            ..Default::default()
        };
        store.save(&config).unwrap();

        let repaired = store.enforce_current_build_invariants().unwrap();
        assert!(!repaired.autostart);
        assert!(!store.load().unwrap().autostart);
        assert!(store.path().ends_with(BACKGROUND_RUNTIME_DEV_FILE_NAME));
    }
}
