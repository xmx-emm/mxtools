use crate::background_runtime::{
    ApexQBackgroundConfig, BackgroundRuntimeConfig, BackgroundRuntimeStore, RazerBackgroundConfig,
    RuntimeLocale,
};
use crate::game::apex_q::{apex_q_from_latest_screenshot, ApexQCaptureResult};
use crate::game::apex_q_ocr::RoiRect;
use crate::ipc_error::{IpcError, IpcResult};
use crate::log_error;
use crate::razer_polling::{
    razer_polling_configure, RazerPollingConfig, RazerPollingDeviceConfig, RazerPollingProfile,
    RazerPollingStatus,
};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const OVERLAY_LABEL: &str = "apex-q-overlay-window";
const CAPTURE_RESULT_EVENT: &str = "apex-q-capture-result";
const OVERLAY_RESULT_EVENT: &str = "apex-q-overlay-result";

static APEX_Q_CONFIG: OnceLock<Mutex<ApexQBackgroundConfig>> = OnceLock::new();
static REGISTERED_APEX_Q_HOTKEY: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static APEX_Q_CAPTURE_BUSY: AtomicBool = AtomicBool::new(false);

fn apex_q_config() -> &'static Mutex<ApexQBackgroundConfig> {
    APEX_Q_CONFIG.get_or_init(|| Mutex::new(ApexQBackgroundConfig::default()))
}

fn registered_apex_q_hotkey() -> &'static Mutex<Option<String>> {
    REGISTERED_APEX_Q_HOTKEY.get_or_init(|| Mutex::new(None))
}

pub struct BackgroundCoordinator;

impl BackgroundCoordinator {
    pub fn start<R: Runtime>(app: &AppHandle<R>) -> IpcResult<()> {
        let store = BackgroundRuntimeStore::from_app(app)?;
        let config = store.enforce_current_build_invariants()?;
        apply_runtime_config_without_razer(app, &config)?;
        let app = app.clone();
        let native_razer = native_razer_config(&config);
        tauri::async_runtime::spawn(async move {
            if let Err(error) = razer_polling_configure(app, native_razer).await {
                log_error!("Failed to apply startup Razer configuration: {error}");
            }
        });
        Ok(())
    }

    /// Stops native background work and restores any Razer rate still owned by
    /// MxTools before the Tauri event loop exits.
    pub fn shutdown_and_restore<R: Runtime>(app: &AppHandle<R>) {
        crate::razer_polling::shutdown_and_restore();
        crate::tray::remove_tray_for_exit(app);
    }
}

pub async fn apply_runtime_config<R: Runtime>(
    app: &AppHandle<R>,
    config: &BackgroundRuntimeConfig,
) -> IpcResult<()> {
    apply_runtime_config_without_razer(app, config)?;
    razer_polling_configure(app.clone(), native_razer_config(config)).await?;
    Ok(())
}

pub async fn apply_razer_runtime_config<R: Runtime>(
    app: &AppHandle<R>,
    config: &BackgroundRuntimeConfig,
) -> IpcResult<Vec<RazerPollingStatus>> {
    razer_polling_configure(app.clone(), native_razer_config(config)).await
}

pub fn apply_runtime_locale<R: Runtime>(
    app: &AppHandle<R>,
    locale: RuntimeLocale,
) -> IpcResult<()> {
    crate::tray::set_tray_locale(app.clone(), runtime_locale_tag(locale).to_string())
}

pub fn apply_apex_q_runtime_config<R: Runtime>(
    app: &AppHandle<R>,
    config: &BackgroundRuntimeConfig,
) -> IpcResult<()> {
    let mut active = apex_q_config().lock().map_err(|_| {
        IpcError::new(
            "background_runtime.apex_q_config_failed",
            "The Apex Q background configuration is unavailable",
        )
    })?;
    sync_apex_q_shortcut(app, config)?;
    *active = config.apex_q.clone();
    Ok(())
}

fn apply_runtime_config_without_razer<R: Runtime>(
    app: &AppHandle<R>,
    config: &BackgroundRuntimeConfig,
) -> IpcResult<()> {
    apply_apex_q_runtime_config(app, config)?;
    crate::tray::set_tray_beta_features(app.clone(), config.beta_features_enabled)?;
    apply_runtime_locale(app, config.locale)?;
    Ok(())
}

fn runtime_locale_tag(locale: RuntimeLocale) -> &'static str {
    match locale {
        RuntimeLocale::EnUs => "en-US",
        RuntimeLocale::ZhCn => "zh-CN",
        RuntimeLocale::System => system_runtime_locale_tag(),
    }
}

#[cfg(windows)]
fn system_runtime_locale_tag() -> &'static str {
    const LOCALE_NAME_MAX_LENGTH: usize = 85;
    #[link(name = "kernel32")]
    extern "system" {
        #[link_name = "GetUserDefaultLocaleName"]
        fn get_user_default_locale_name(locale_name: *mut u16, locale_name_length: i32) -> i32;
    }

    let mut locale_name = [0_u16; LOCALE_NAME_MAX_LENGTH];
    let length = unsafe {
        get_user_default_locale_name(
            locale_name.as_mut_ptr(),
            i32::try_from(locale_name.len()).unwrap_or(i32::MAX),
        )
    };
    if length > 1 {
        let value = String::from_utf16_lossy(&locale_name[..length as usize - 1]);
        if value.to_ascii_lowercase().starts_with("zh") {
            return "zh-CN";
        }
    }
    "en-US"
}

#[cfg(not(windows))]
fn system_runtime_locale_tag() -> &'static str {
    "en-US"
}

fn native_razer_config(config: &BackgroundRuntimeConfig) -> RazerPollingConfig {
    let mut native = to_native_razer_config(&config.razer);
    native.enabled &= config.beta_features_enabled;
    native
}

fn to_native_razer_config(config: &RazerBackgroundConfig) -> RazerPollingConfig {
    let devices = config
        .device_profiles
        .iter()
        .filter_map(|(device_id, device)| {
            if !device.verified_rates_hz.contains(&device.idle_rate_hz) {
                return None;
            }
            let profiles = config
                .games
                .iter()
                .filter_map(|game| {
                    let rate_hz = *game.device_rates_hz.get(device_id)?;
                    if !game.enabled || !device.verified_rates_hz.contains(&rate_hz) {
                        return None;
                    }
                    let executable_paths = game
                        .matchers
                        .iter()
                        .filter_map(|matcher| matcher.executable.clone())
                        .collect::<Vec<_>>();
                    let package_family_names = game
                        .matchers
                        .iter()
                        .filter_map(|matcher| matcher.package_family_name.clone())
                        .collect::<Vec<_>>();
                    if executable_paths.is_empty() && package_family_names.is_empty() {
                        return None;
                    }
                    Some(RazerPollingProfile {
                        profile_id: game.id.clone(),
                        display_name: game.name.clone(),
                        executable_paths,
                        package_family_names,
                        rate_hz,
                    })
                })
                .collect();
            Some(RazerPollingDeviceConfig {
                device_id: device_id.clone(),
                idle_rate_hz: device.idle_rate_hz,
                profiles,
            })
        })
        .collect::<Vec<_>>();
    RazerPollingConfig {
        schema_version: 1,
        enabled: config.enabled && !devices.is_empty(),
        devices,
    }
}

fn sync_apex_q_shortcut<R: Runtime>(
    app: &AppHandle<R>,
    config: &BackgroundRuntimeConfig,
) -> IpcResult<()> {
    let desired = desired_apex_q_hotkey(config);
    let mut registered = registered_apex_q_hotkey().lock().map_err(|_| {
        IpcError::new(
            "background_runtime.hotkey_state_failed",
            "The Apex Q hotkey state is unavailable",
        )
    })?;
    if *registered == desired {
        return Ok(());
    }
    let previous = registered.clone();
    if let Some(shortcut) = previous.as_deref() {
        app.global_shortcut()
            .unregister(shortcut)
            .map_err(|error| {
                IpcError::new(
                    "background_runtime.hotkey_unregister_failed",
                    "Failed to unregister the previous Apex Q hotkey",
                )
                .with_detail("detail", error.to_string())
            })?;
    }
    *registered = None;
    let Some(shortcut) = desired else {
        return Ok(());
    };
    if let Err(error) = register_apex_q_shortcut(app, &shortcut) {
        let mut failure = IpcError::new(
            "background_runtime.hotkey_register_failed",
            "Failed to register the Apex Q hotkey",
        )
        .with_detail("detail", error);
        if let Some(previous) = previous {
            match register_apex_q_shortcut(app, &previous) {
                Ok(()) => {
                    *registered = Some(previous);
                    failure = failure.with_detail("rollback", "restored");
                }
                Err(rollback_error) => {
                    failure = failure
                        .with_detail("rollback", "failed")
                        .with_detail("rollbackDetail", rollback_error);
                }
            }
        } else {
            failure = failure.with_detail("rollback", "notNeeded");
        }
        return Err(failure);
    }
    *registered = Some(shortcut);
    Ok(())
}

fn desired_apex_q_hotkey(config: &BackgroundRuntimeConfig) -> Option<String> {
    (config.beta_features_enabled
        && config.apex_q.enabled
        && config.apex_q.setup_done
        && !config.apex_q.hotkey.trim().is_empty())
    .then(|| config.apex_q.hotkey.trim().to_string())
}

fn register_apex_q_shortcut<R: Runtime>(app: &AppHandle<R>, shortcut: &str) -> Result<(), String> {
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _, event| {
            if event.state == ShortcutState::Pressed {
                dispatch_apex_q_capture(app);
            }
        })
        .map_err(|error| error.to_string())
}

fn dispatch_apex_q_capture<R: Runtime>(app: &AppHandle<R>) {
    let Some(lease) = ApexQCaptureLease::try_acquire() else {
        return;
    };
    let config = match apex_q_config().lock() {
        Ok(config) => config.clone(),
        Err(_) => {
            let _ = app.emit(
                "apex-q-native-capture-error",
                "The Apex Q background configuration is unavailable",
            );
            return;
        }
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _lease = lease;
        run_apex_q_capture(app, config).await;
    });
}

struct ApexQCaptureLease;

impl ApexQCaptureLease {
    fn try_acquire() -> Option<Self> {
        APEX_Q_CAPTURE_BUSY
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
            .then_some(Self)
    }
}

impl Drop for ApexQCaptureLease {
    fn drop(&mut self) {
        APEX_Q_CAPTURE_BUSY.store(false, Ordering::Release);
    }
}

async fn run_apex_q_capture<R: Runtime>(app: AppHandle<R>, config: ApexQBackgroundConfig) {
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .ok();
    let result = apex_q_from_latest_screenshot(
        config.screenshot_folder.clone(),
        u64::from(config.delay_ms),
        RoiRect {
            x: config.showpos_roi.x,
            y: config.showpos_roi.y,
            w: config.showpos_roi.w,
            h: config.showpos_roi.h,
        },
        RoiRect {
            x: config.ping_roi.x,
            y: config.ping_roi.y,
            w: config.ping_roi.w,
            h: config.ping_roi.h,
        },
        Some(
            match config.ocr_engine {
                crate::background_runtime::ApexQOcrEngine::Auto => "auto",
                crate::background_runtime::ApexQOcrEngine::Rapid => "rapid",
                crate::background_runtime::ApexQOcrEngine::Win => "win",
            }
            .to_string(),
        ),
        started_at,
        Some(true),
    )
    .await;

    match result {
        Ok(result) => {
            let envelope = CaptureEnvelope::new(result.clone());
            let _ = app.emit(CAPTURE_RESULT_EVENT, &envelope);
            if let Some(theta) = &result.theta {
                let payload = OverlayPayload {
                    theta,
                    r: result.distance_m.unwrap_or(theta.r),
                    alpha: result.alpha.unwrap_or(theta.alpha),
                    hide_sec: config.overlay_hide_sec,
                };
                if let Ok(value) = serde_json::to_value(payload) {
                    let _ = show_overlay(&app, &config, value);
                }
            }
        }
        Err(error) => {
            let _ = app.emit("apex-q-native-capture-error", error);
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureEnvelope {
    id: String,
    emitted_at: u64,
    result: ApexQCaptureResult,
}

impl CaptureEnvelope {
    fn new(result: ApexQCaptureResult) -> Self {
        let emitted_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or_default();
        Self {
            id: format!("native-{emitted_at}"),
            emitted_at,
            result,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OverlayPayload<'a> {
    theta: &'a crate::game::apex_theta::ThetaResult,
    r: f64,
    alpha: f64,
    hide_sec: u32,
}

fn show_overlay<R: Runtime>(
    app: &AppHandle<R>,
    config: &ApexQBackgroundConfig,
    payload: serde_json::Value,
) -> IpcResult<()> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        window
            .emit(OVERLAY_RESULT_EVENT, payload)
            .map_err(overlay_error)?;
        window.show().map_err(overlay_error)?;
        return Ok(());
    }

    let payload_on_load = payload.clone();
    let mut builder = WebviewWindowBuilder::new(
        app,
        OVERLAY_LABEL,
        WebviewUrl::App("index.html#/apex-q-overlay".into()),
    )
    .title("APEX Q")
    .inner_size(f64::from(config.overlay_w), f64::from(config.overlay_h))
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(true)
    .on_page_load(move |window, load| {
        if load.event() == PageLoadEvent::Finished {
            let _ = window.emit(OVERLAY_RESULT_EVENT, payload_on_load.clone());
        }
    });
    if let (Some(x), Some(y)) = (config.overlay_x, config.overlay_y) {
        builder = builder.position(x, y);
    }
    let window = builder.build().map_err(overlay_error)?;
    window
        .set_ignore_cursor_events(config.overlay_locked)
        .map_err(overlay_error)?;
    Ok(())
}

fn overlay_error(error: impl ToString) -> IpcError {
    IpcError::new(
        "background_runtime.overlay_failed",
        "Failed to create or update the Apex Q overlay",
    )
    .with_detail("detail", error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::background_runtime::{
        RazerDevicePollingConfig, RazerGameMatcher, RazerGamePollingConfig,
    };
    use std::collections::BTreeMap;

    #[test]
    fn apex_q_hotkey_requires_beta_setup_and_enablement() {
        let mut config = BackgroundRuntimeConfig::default();
        config.apex_q.hotkey = "  Ctrl+Alt+Q  ".to_string();
        assert_eq!(desired_apex_q_hotkey(&config), None);

        config.beta_features_enabled = true;
        config.apex_q.enabled = true;
        assert_eq!(desired_apex_q_hotkey(&config), None);

        config.apex_q.setup_done = true;
        assert_eq!(
            desired_apex_q_hotkey(&config).as_deref(),
            Some("Ctrl+Alt+Q")
        );
    }

    #[test]
    fn explicit_runtime_locales_map_without_webview_state() {
        assert_eq!(runtime_locale_tag(RuntimeLocale::ZhCn), "zh-CN");
        assert_eq!(runtime_locale_tag(RuntimeLocale::EnUs), "en-US");
    }

    #[test]
    fn native_razer_config_keeps_per_device_rates_and_exact_matchers() {
        let mut config = BackgroundRuntimeConfig::default();
        config.beta_features_enabled = true;
        config.razer.enabled = true;
        config.razer.device_profiles.insert(
            "device-a".to_string(),
            RazerDevicePollingConfig {
                idle_rate_hz: 500,
                verified_rates_hz: vec![500, 4_000],
                ..Default::default()
            },
        );
        config.razer.games.push(RazerGamePollingConfig {
            id: "apex".to_string(),
            name: "Apex Legends".to_string(),
            enabled: true,
            matchers: vec![RazerGameMatcher {
                executable: Some(r"C:\Games\Apex\r5apex.exe".to_string()),
                package_family_name: Some("EA.Apex_123".to_string()),
                ..Default::default()
            }],
            device_rates_hz: BTreeMap::from([("device-a".to_string(), 4_000)]),
            ..Default::default()
        });

        let native = native_razer_config(&config);
        assert!(native.enabled);
        assert_eq!(native.devices.len(), 1);
        assert_eq!(native.devices[0].device_id, "device-a");
        assert_eq!(native.devices[0].idle_rate_hz, 500);
        assert_eq!(native.devices[0].profiles.len(), 1);
        assert_eq!(native.devices[0].profiles[0].rate_hz, 4_000);
        assert_eq!(
            native.devices[0].profiles[0].executable_paths,
            [r"C:\Games\Apex\r5apex.exe"]
        );
        assert_eq!(
            native.devices[0].profiles[0].package_family_names,
            ["EA.Apex_123"]
        );
    }

    #[test]
    fn native_razer_config_omits_unverified_device_rates() {
        let mut config = BackgroundRuntimeConfig::default();
        config.beta_features_enabled = true;
        config.razer.enabled = true;
        config.razer.device_profiles.insert(
            "device-a".to_string(),
            RazerDevicePollingConfig {
                idle_rate_hz: 1_000,
                verified_rates_hz: vec![500, 1_000],
                ..Default::default()
            },
        );
        config.razer.games.push(RazerGamePollingConfig {
            id: "game".to_string(),
            name: "Game".to_string(),
            enabled: true,
            matchers: vec![RazerGameMatcher {
                executable: Some(r"C:\Games\game.exe".to_string()),
                ..Default::default()
            }],
            device_rates_hz: BTreeMap::from([("device-a".to_string(), 8_000)]),
            ..Default::default()
        });

        let native = native_razer_config(&config);
        assert!(native.enabled);
        assert!(native.devices[0].profiles.is_empty());

        config
            .razer
            .device_profiles
            .get_mut("device-a")
            .unwrap()
            .idle_rate_hz = 8_000;
        let native = native_razer_config(&config);
        assert!(!native.enabled);
        assert!(native.devices.is_empty());
    }

    #[test]
    fn capture_lease_blocks_overlap_and_releases_on_drop() {
        APEX_Q_CAPTURE_BUSY.store(false, Ordering::Release);
        let first = ApexQCaptureLease::try_acquire().expect("first capture should acquire");
        assert!(ApexQCaptureLease::try_acquire().is_none());
        drop(first);
        let second = ApexQCaptureLease::try_acquire().expect("lease should be reusable");
        drop(second);
        assert!(!APEX_Q_CAPTURE_BUSY.load(Ordering::Acquire));
    }
}
