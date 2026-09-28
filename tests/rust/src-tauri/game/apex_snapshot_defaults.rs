#[test]
fn snapshot_defaults_are_parsed_without_file_writes() {
    let defaults = crate::game::apex_defaults::ApexDefaultConfigs {
        video: "\"VideoConfig\"\n{\n\"setting.fullscreen\" \"1\"\n}\n".into(),
        settings: crate::game::apex_defaults::APEX_DEFAULT_SETTINGS_CFG.into(),
        profile: "cl_fovScale \"1.0\"\n".into(),
    };
    let result = snapshot_defaults_from_configs(&defaults).unwrap();
    assert_eq!(result.video_config.get("setting.fullscreen").unwrap(), "1");
    assert_eq!(result.profile.get("cl_fovScale").unwrap(), "1.0");
    assert!(result
        .bindings
        .iter()
        .any(|b| b.input == "MOUSE2" && b.command == "+toggle_zoom"));
    assert!(result.bindings.iter().any(|b| b.command == "+forward"));
    assert!(result
        .bindings
        .iter()
        .any(|b| b.input == "KP_INS" && b.command == "toggle_obs_auto_mapcam"));
}
