use crate::background_runtime::{
    BackgroundRuntimeConfig, BackgroundRuntimeStore, RazerBackgroundConfig, RuntimeLocale,
};
use crate::ipc_error::IpcResult;
use crate::log_error;
use crate::razer_polling::{
    razer_polling_configure, RazerPollingConfig, RazerPollingDeviceConfig, RazerPollingProfile,
    RazerPollingStatus,
};
use tauri::{AppHandle, Runtime};

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

fn apply_runtime_config_without_razer<R: Runtime>(
    app: &AppHandle<R>,
    config: &BackgroundRuntimeConfig,
) -> IpcResult<()> {
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
    to_native_razer_config(&config.razer)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::background_runtime::{
        RazerDevicePollingConfig, RazerGameMatcher, RazerGamePollingConfig,
    };
    use std::collections::BTreeMap;

    #[test]
    fn explicit_runtime_locales_map_without_webview_state() {
        assert_eq!(runtime_locale_tag(RuntimeLocale::ZhCn), "zh-CN");
        assert_eq!(runtime_locale_tag(RuntimeLocale::EnUs), "en-US");
    }

    #[test]
    fn native_razer_config_keeps_per_device_rates_and_exact_matchers() {
        let mut config = BackgroundRuntimeConfig {
            beta_features_enabled: true,
            ..Default::default()
        };
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
        let mut config = BackgroundRuntimeConfig {
            beta_features_enabled: true,
            ..Default::default()
        };
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

}

#[cfg(test)]
mod razer_stable_tests {
    use super::*;
    use crate::background_runtime::{
        RazerDevicePollingConfig, RazerGameMatcher, RazerGamePollingConfig,
    };
    use std::collections::BTreeMap;
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/razer_stable_config.rs"
    ));
}
