#[test]
fn current_default_preferences_are_complete_and_device_independent() {
    let profile = profile_for_language("english").unwrap();
    for (text, count) in [(APEX_DEFAULT_SETTINGS_CFG, 35), (profile.as_str(), 149)] {
        let doc = ApexCfgDocument::from_content(
            text,
            windows_tool::game::apex::config::ApexFileEncoding::Utf8,
        )
        .unwrap();
        assert_eq!(doc.key_values().len(), count);
        for key in ["name", "miles_output_device", "voice_input_device"] {
            assert!(!doc.key_values().contains_key(key), "machine-local {key}");
        }
    }
    for preference in [
        "mouse_sensitivity \"5\"",
        "miles_channels \"0\"",
        "VoiceChatMode \"0\"",
        "sound_volume_voice \"1\"",
        "ui_layout_mode \"0\"",
        "gfx_amdUseLowLatency \"1\"",
        "gfx_nvnUseLowLatency \"1\"",
        "gfx_nvnUseLowLatencyBoost \"0\"",
    ] {
        assert!(
            APEX_DEFAULT_SETTINGS_CFG.contains(preference),
            "{preference}"
        );
    }
}

#[test]
fn current_defaults_keep_all_bindings_without_retired_preferences() {
    let bindings: Vec<_> = APEX_DEFAULT_SETTINGS_CFG
        .lines()
        .filter(|line| line.starts_with("bind_"))
        .collect();
    assert_eq!(bindings.len(), 108);
    assert!(bindings.contains(&"bind_US_standard \"KP_INS\" \"toggle_obs_auto_mapcam\" 0"));
    for retired in [
        "voice_forcemicrecord",
        "voice_mixer_boost",
        "voice_mixer_mute",
        "voice_mixer_volume",
    ] {
        assert!(
            !APEX_DEFAULT_SETTINGS_CFG.contains(retired),
            "retired {retired}"
        );
    }
}
