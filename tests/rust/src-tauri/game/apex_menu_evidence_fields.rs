#[test]
fn menu_evidence_fields_round_trip_every_choice_without_changing_other_keys() {
    let root = std::env::temp_dir().join(format!(
        "mxtools-menu-fields-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir(&root).unwrap();
    let path = root.join("profile.cfg");
    let seed = "// Preserve personal choices\r\ncl_fovScale \"1.5\"\r\n\
        dialogue_cat_legend_flavor \"1\"\r\nps5_force_enable_adth \"1\"\r\n\
        hud_setting_accessibleChat \"0\"\r\ndialogue_cat_weapon_flavor \"1\"\r\n";
    for (key, values) in [
        ("dialogue_cat_weapon_flavor", BOOL),
        ("hud_setting_accessibleChat", ZERO_TO_THREE),
    ] {
        let mut doc = ApexCfgDocument::from_content(seed, ApexFileEncoding::Utf8).unwrap();
        for value in values {
            let updates = HashMap::from([(key.into(), (*value).into())]);
            apply_profile_updates(&mut doc, &updates).unwrap();
            atomic_write(&path, &encode_doc(&doc)).unwrap();
            verify_updates(ConfigFile::Profile, &path, &updates).unwrap();
            let loaded = load_file_at_path(path.clone()).unwrap();
            let report = report_for(ConfigFile::Profile, &loaded);
            assert!(!report.unknown_keys.contains(&key.to_string()));
            assert_eq!(report.values.get(key).map(String::as_str), Some(*value));
            assert_eq!(
                report.values.get("cl_fovScale").map(String::as_str),
                Some("1.5")
            );
            assert_eq!(
                report
                    .values
                    .get("dialogue_cat_legend_flavor")
                    .map(String::as_str),
                Some("1")
            );
            assert_eq!(
                report
                    .values
                    .get("ps5_force_enable_adth")
                    .map(String::as_str),
                Some("1")
            );
            assert!(!report.values.contains_key("dialogue_cat_weapon_important"));
            doc = loaded.doc;
            assert!(doc.to_string().contains("// Preserve personal choices\r\n"));
        }
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn menu_evidence_fields_reject_undeclared_choices_before_modifying_the_document() {
    for (key, invalid) in [
        (
            "dialogue_cat_weapon_flavor",
            &["-1", "2", "3", "0.5", "NaN", "1\n0"][..],
        ),
        (
            "hud_setting_accessibleChat",
            &["-1", "4", "0.5", "NaN", "1\n0"][..],
        ),
    ] {
        for value in invalid {
            let mut doc =
                ApexCfgDocument::from_content("cl_fovScale \"1.5\"\r\n", ApexFileEncoding::Utf8)
                    .unwrap();
            let before = doc.to_string();
            assert!(apply_profile_updates(
                &mut doc,
                &HashMap::from([(key.into(), (*value).into())])
            )
            .is_err());
            assert_eq!(doc.to_string(), before);
        }
    }
}
