#[test]
fn review_settings_binary_readers_accept_canonical_boolean_writes() {
    for key in ["cl_safearea", "hudchat_visibility"] {
        for value in ["0", "1"] {
            let mut doc = ApexCfgDocument::from_content(
                "cl_fovScale \"1.5\"\r\ncl_safearea \"0\"\r\nhudchat_visibility \"1\"\r\n",
                ApexFileEncoding::Utf8,
            )
            .unwrap();
            apply_profile_updates(&mut doc, &HashMap::from([(key.into(), value.into())])).unwrap();
            assert_eq!(doc.get(key), Some(value));
            assert_eq!(doc.get("cl_fovScale"), Some("1.5"));
        }
    }
}

#[test]
fn review_settings_reject_invented_scale_or_third_mode_without_partial_updates() {
    for key in ["cl_safearea", "hudchat_visibility"] {
        for value in ["-1", "2", "0.5", "NaN", "1\n0"] {
            let mut doc = ApexCfgDocument::from_content(
                "cl_fovScale \"1.5\"\r\ncl_safearea \"0\"\r\nhudchat_visibility \"1\"\r\n",
                ApexFileEncoding::Utf8,
            )
            .unwrap();
            let before = doc.to_string();
            let updates = HashMap::from([
                (key.into(), value.into()),
                ("cl_fovScale".into(), "1.4".into()),
            ]);
            assert!(apply_profile_updates(&mut doc, &updates).is_err());
            assert_eq!(doc.to_string(), before);
        }
    }
}

#[test]
fn review_settings_preserve_all_raw_values_across_normal_edits_and_two_disk_reads() {
    let root = std::env::temp_dir().join(format!(
        "mxtools-review-settings-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir(&root).unwrap();
    let path = root.join("profile.cfg");
    // Include old noncanonical values: stricter writes must not rewrite them on read.
    let preserved = [
        ("cl_deathhints_enabled", "0"),
        ("cl_safearea", "0.5"),
        ("hud_setting_accolades_hudState", "2"),
        ("hud_setting_accolades_tier_filter", "3"),
        ("hud_setting_adsDof", "0"),
        ("hud_setting_aind", "7"),
        ("hud_setting_compactOverHeadNames", "1"),
        ("hud_setting_pingDoubleTapEnemy", "0"),
        ("hud_setting_showCallsigns", "0"),
        ("hud_setting_showLevelUp", "0"),
        ("hud_setting_showTeamNamesOnMap", "1"),
        ("hud_setting_showWeaponFlyouts", "0"),
        ("hudchat_visibility", "2"),
        ("party_color_enabled", "1"),
        ("rankedplay_display_enabled", "1"),
        ("rankedplay_voice_enabled", "1"),
        ("sound_musicReduced", "1"),
        ("ziprail_roll_strength", "0.37"),
        ("ps5_force_enable_adth", "1"),
        ("future_setting", "keep me"),
    ];
    let mut source = String::from(
        "// Preserve unedited values\r\ncl_fovScale \"1.5\"\r\ndialogue_cat_weapon_flavor \"1\"\r\n",
    );
    for (key, value) in preserved {
        source.push_str(&format!("{key} \"{value}\"\r\n"));
    }
    let mut doc = ApexCfgDocument::from_content(&source, ApexFileEncoding::Utf8).unwrap();
    for value in ["0", "1"] {
        let updates = HashMap::from([("dialogue_cat_weapon_flavor".into(), value.into())]);
        apply_profile_updates(&mut doc, &updates).unwrap();
        atomic_write(&path, &encode_doc(&doc)).unwrap();
        verify_updates(ConfigFile::Profile, &path, &updates).unwrap();
        for _ in 0..2 {
            let loaded = load_file_at_path(path.clone()).unwrap();
            let report = report_for(ConfigFile::Profile, &loaded);
            for (key, raw) in preserved {
                assert_eq!(report.values.get(key).map(String::as_str), Some(raw), "{key}");
            }
            assert_eq!(report.values.get("cl_fovScale").map(String::as_str), Some("1.5"));
            assert_eq!(
                report.values.get("dialogue_cat_weapon_flavor").map(String::as_str),
                Some(value)
            );
            doc = loaded.doc;
            assert!(doc.to_string().contains("// Preserve unedited values\r\n"));
        }
    }
    fs::remove_dir_all(root).unwrap();
}
