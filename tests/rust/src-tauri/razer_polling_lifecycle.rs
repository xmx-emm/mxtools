use super::super::{
    connection_for_product, devices_to_restore_on_configure, LatestForegroundEvent,
    RazerPollingConfig, RazerPollingDeviceConfig, CONFIG_SCHEMA_VERSION,
};
use std::collections::BTreeSet;

fn config(enabled: bool, device_ids: &[&str]) -> RazerPollingConfig {
    RazerPollingConfig {
        schema_version: CONFIG_SCHEMA_VERSION,
        enabled,
        devices: device_ids
            .iter()
            .map(|device_id| RazerPollingDeviceConfig {
                device_id: (*device_id).into(),
                idle_rate_hz: 1000,
                profiles: Vec::new(),
            })
            .collect(),
    }
}

fn baselines(device_ids: &[&str]) -> BTreeSet<String> {
    device_ids.iter().map(|id| (*id).to_string()).collect()
}

#[test]
fn removing_a_device_from_an_enabled_config_restores_only_that_device() {
    let previous = config(true, &["kept", "removed", "removed-without-baseline"]);
    let next = config(true, &["kept"]);
    assert_eq!(
        devices_to_restore_on_configure(
            Some(&previous),
            &next,
            &baselines(&["kept", "removed", "manual-only"]),
        ),
        vec!["removed".to_string()]
    );
}

#[test]
fn enabling_from_disabled_or_empty_state_restores_nothing() {
    let next = config(true, &["mouse"]);
    let all = baselines(&["mouse", "other"]);
    assert!(devices_to_restore_on_configure(None, &next, &all).is_empty());
    assert!(
        devices_to_restore_on_configure(Some(&config(false, &["other"])), &next, &all)
            .is_empty()
    );
}

#[test]
fn disabling_restores_every_device_with_a_baseline() {
    let previous = config(true, &["mouse"]);
    assert_eq!(
        devices_to_restore_on_configure(
            Some(&previous),
            &config(false, &[]),
            &baselines(&["mouse", "other"]),
        ),
        vec!["mouse".to_string(), "other".to_string()]
    );
}

#[test]
fn device_change_wake_does_not_replace_a_pending_foreground_window() {
    let events = LatestForegroundEvent::default();
    events.wake();
    assert_eq!(events.take_pending(), Some(0));

    events.publish(42);
    events.wake();
    assert_eq!(events.take_pending(), Some(42));

    events.stop();
    events.wake();
    assert_eq!(events.take_pending(), None);
}

#[test]
fn wireless_classification_covers_multiple_receiver_product_ids() {
    for product_id in [0x007c, 0x00b7, 0x00c1, 0x00e6] {
        assert_eq!(connection_for_product(product_id), "wireless");
    }
    for product_id in [0x00b6, 0x00c0, 0x0001] {
        assert_eq!(connection_for_product(product_id), "wired");
    }
}
