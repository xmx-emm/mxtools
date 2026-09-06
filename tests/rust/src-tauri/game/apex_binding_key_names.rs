#[test]
fn binding_writes_use_canonical_names_and_preserve_other_lines() {
    let original = "bind_US_standard \"[[\" \"in_spec_toggle_freecam\" 0\n";
    let mut doc = ApexCfgDocument::from_content(
        &format!("{original}bind_US_standard \"w\" \"+forward\" 0\n"),
        ApexFileEncoding::Utf8,
    )
    .unwrap();
    assert_eq!(binding_groups(&doc)[0].public.input, "[[");
    apply_binding_mutations(
        &mut doc,
        &[ApexBindingMutation::Update {
            id: "binding:1".into(),
            input: ";".into(),
        }],
    )
    .unwrap();
    assert!(doc.to_string().starts_with(original));
    assert!(doc.to_string().contains("\"SEMICOLON\" \"+forward\""));
    apply_binding_mutations(
        &mut doc,
        &[ApexBindingMutation::Update {
            id: "binding:0".into(),
            input: "[".into(),
        }],
    )
    .unwrap();
    assert!(doc.to_string().starts_with(original));
    assert!(valid_binding_input("[["));
    assert!(valid_binding_input("SEMICOLON"));
}

#[test]
fn game_setting_defaults_and_sensitivity_follow_validation() {
    assert!(validate_value(ConfigFile::Settings, "mouse_sensitivity", "0.1").is_ok());
    assert!(validate_value(ConfigFile::Settings, "mouse_sensitivity", "0.01").is_err());
    assert!(validate_value(ConfigFile::Profile, "reticle_color", "").is_ok());
    let profile = crate::game::apex_defaults::APEX_DEFAULT_PROFILE_CFG;
    for line in [
        "cl_fovScale \"1.27216005\"",
        "hud_setting_minimapRotate \"0\"",
        "joy_rumble \"2\"",
        "player_setting_damage_closes_deathbox_menu \"1\"",
        "reticle_color \"\"",
        "toggle_on_jump_to_deactivate \"1\"",
    ] {
        assert!(profile.lines().any(|candidate| candidate == line), "{line}");
    }
    assert!(!profile
        .lines()
        .any(|line| line.starts_with("closecaption ")));
}
