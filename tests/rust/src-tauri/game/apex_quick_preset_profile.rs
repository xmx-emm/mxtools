fn optimizations() -> HashMap<String, String> {
    HashMap::from([
        ("player_setting_damage_closes_deathbox_menu".into(), "0".into()),
        ("player_setting_stickysprintforward".into(), "1".into()),
        ("player_setting_autosprint".into(), "1".into()),
        ("hud_setting_minimapRotate".into(), "1".into()),
        ("closecaption".into(), "0".into()),
        ("fov_disableAbilityScaling".into(), "1".into()),
        ("sprint_view_shake_style".into(), "1".into()),
    ])
}

#[test]
fn missing_and_empty_profiles_gain_defaults_and_every_selected_optimization() {
    for source in ["", "\r\n// Empty profile\r\n"] {
        let mut doc = ApexCfgDocument::from_content(source, ApexFileEncoding::Utf8).unwrap();
        let updates = optimizations();
        apply_profile_updates(&mut doc, &updates).unwrap();
        let output = encode_doc(&doc);
        let (text, encoding) = decode_bytes(&output).unwrap();
        let readback = ApexCfgDocument::from_content(&text, encoding).unwrap();
        for (key, value) in &updates {
            assert_eq!(readback.key_values().get(key), Some(value));
        }
        assert_eq!(readback.get("cl_fovScale"), Some("1.27216005"));
        let once = readback.to_string();
        let mut reopened = readback;
        apply_profile_updates(&mut reopened, &updates).unwrap();
        assert_eq!(reopened.to_string(), once);
    }
}

#[test]
fn reset_template_can_disable_language_owned_subtitles_explicitly() {
    let mut doc = ApexCfgDocument::from_content(
        crate::game::apex_defaults::APEX_DEFAULT_PROFILE_CFG,
        ApexFileEncoding::Utf8,
    )
    .unwrap();
    assert!(!doc.path_exists("closecaption"));
    apply_profile_updates(&mut doc, &optimizations()).unwrap();
    assert_eq!(doc.key_values().get("closecaption").map(String::as_str), Some("0"));
}

#[test]
fn partial_profile_preserves_personal_values_comments_and_unselected_keys() {
    let mut doc = ApexCfgDocument::from_content(
        "// keep me\r\ncl_fovScale \"1.5\"\r\nplayer_setting_autosprint \"0\"\r\ncustom_key \"value\"\r\n",
        ApexFileEncoding::Utf8,
    )
    .unwrap();
    apply_profile_updates(&mut doc, &HashMap::from([("closecaption".into(), "0".into())]))
        .unwrap();
    assert_eq!(doc.get("cl_fovScale"), Some("1.5"));
    assert_eq!(doc.get("player_setting_autosprint"), Some("0"));
    assert_eq!(doc.get("custom_key"), Some("value"));
    assert!(!doc.path_exists("sprint_view_shake_style"));
    assert!(doc.to_string().contains("// keep me\r\n"));
}

#[test]
fn profile_bootstrap_rejects_invalid_values_and_unknown_keys_before_modifying_the_doc() {
    for (key, value) in [("closecaption", "2"), ("unknown", "1")] {
        let mut doc = ApexCfgDocument::new();
        assert!(apply_profile_updates(&mut doc, &HashMap::from([(key.into(), value.into())])).is_err());
        assert!(doc.lines.is_empty());
    }
    let mut doc = ApexCfgDocument::new();
    apply_profile_updates(&mut doc, &HashMap::new()).unwrap();
    assert!(doc.lines.is_empty());
}

#[test]
fn selected_profile_values_survive_atomic_disk_write_and_report_readback() {
    let path = std::env::temp_dir().join(format!(
        "mxtools-profile-preset-{}-{}.cfg",
        std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
    ));
    let mut doc = ApexCfgDocument::new();
    let updates = optimizations();
    apply_profile_updates(&mut doc, &updates).unwrap();
    atomic_write(&path, &encode_doc(&doc)).unwrap();
    verify_updates(ConfigFile::Profile, &path, &updates).unwrap();
    let bytes = fs::read(&path).unwrap();
    let (text, encoding) = decode_bytes(&bytes).unwrap();
    let loaded = LoadedFile {
        path: path.clone(),
        revision: revision(&bytes),
        bytes,
        doc: ApexCfgDocument::from_content(&text, encoding).unwrap(),
    };
    let report = report_for(ConfigFile::Profile, &loaded);
    for (key, value) in updates {
        assert_eq!(report.values.get(&key), Some(&value));
    }
    fs::remove_file(path).unwrap();
}
