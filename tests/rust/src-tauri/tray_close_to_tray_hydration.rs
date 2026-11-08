use super::close_to_tray_from_settings_json;

#[test]
fn reads_close_to_tray_from_the_persisted_settings_store() {
    assert!(close_to_tray_from_settings_json(r#"{"closeToTray":true,"locale":"system"}"#));
    assert!(!close_to_tray_from_settings_json(r#"{"closeToTray":false}"#));
}

#[test]
fn defaults_to_quit_for_missing_or_malformed_settings() {
    assert!(!close_to_tray_from_settings_json("{}"));
    assert!(!close_to_tray_from_settings_json(r#"{"closeToTray":"yes"}"#));
    assert!(!close_to_tray_from_settings_json("not json"));
}
