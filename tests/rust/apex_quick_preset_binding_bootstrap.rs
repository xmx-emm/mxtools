#[test]
fn rejects_quick_preset_bindings_without_a_generated_binding_baseline() {
    let mutations = [
        ApexBindingMutation::CreateCommand {
            command: "+zoom".into(),
            input: "MOUSE2".into(),
            context: 0,
        },
        ApexBindingMutation::CreateCommand {
            command: "+forward".into(),
            input: "MWHEELUP".into(),
            context: 1,
        },
        ApexBindingMutation::CreateCommand {
            command: "+jump".into(),
            input: "MWHEELDOWN".into(),
            context: 1,
        },
    ];
    let mut doc = ApexCfgDocument::new();
    apply_binding_mutations(&mut doc, &mutations).unwrap();

    assert_eq!(
        ensure_binding_baseline(&doc, &mutations).unwrap_err(),
        "apexQuickPreset.bindingSettingsMissing"
    );
}

#[test]
fn preserves_custom_bindings_using_only_quick_preset_command_names() {
    let mut doc = ApexCfgDocument::from_content(
        concat!(
            "bind_US_standard \"MOUSE4\" \"+zoom\" 0\n",
            "bind_US_standard \"MOUSE5\" \"+toggle_zoom\" 1\n",
            "bind_US_standard \"UPARROW\" \"+forward\" 0\n",
            "bind_US_standard \"KP_ENTER\" \"+jump\" 1\n",
        ),
        ApexFileEncoding::Utf8,
    )
    .unwrap();
    let original = doc.to_string();

    assert!(!init_settings_doc_from_default(&mut doc).unwrap());
    assert_eq!(doc.to_string(), original);
}

#[test]
fn initializes_only_the_exact_old_three_binding_bootstrap() {
    let mut doc = ApexCfgDocument::from_content(
        concat!(
            "bind_US_standard \"MOUSE2\" \"+zoom\" 0\n",
            "bind_US_standard \"MWHEELUP\" \"+forward\" 1\n",
            "bind_US_standard \"MWHEELDOWN\" \"+jump\" 1\n",
        ),
        ApexFileEncoding::Utf8,
    )
    .unwrap();

    assert!(init_settings_doc_from_default(&mut doc).unwrap());
    assert!(doc.to_string().contains("weaponSelectPrimary0"));
}

#[test]
fn validates_direct_binding_commands_before_writing() {
    let mut doc = ApexCfgDocument::new();
    let error = apply_binding_mutations(
        &mut doc,
        &[ApexBindingMutation::CreateCommand {
            command: "exec arbitrary.cfg".into(),
            input: "MOUSE2".into(),
            context: 0,
        }],
    )
    .unwrap_err();

    assert!(error.contains("bindingNotEditable"));
    assert!(doc.lines.is_empty());
}

#[test]
fn skips_verification_for_an_untouched_missing_config_file() {
    let path = std::env::temp_dir().join(format!(
        "mxtools-missing-profile-{}-{}.cfg",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    assert!(!path.exists());

    verify_updates(ConfigFile::Profile, &path, &HashMap::new()).unwrap();
    assert!(!path.exists());
}
