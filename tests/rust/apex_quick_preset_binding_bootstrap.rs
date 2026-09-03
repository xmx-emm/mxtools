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
fn command_bindings_replace_slots_exposed_by_default_initialization() {
    let mut doc = ApexCfgDocument::new();
    assert!(init_settings_doc_from_default(&mut doc).unwrap());
    let default_mouse2 = binding_groups(&doc)
        .into_iter()
        .find(|group| group.public.input.eq_ignore_ascii_case("MOUSE2"))
        .expect("default template should expose the right-mouse binding");
    assert_eq!(default_mouse2.public.command, "+toggle_zoom");
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

    let mutations =
        rebase_binding_mutations_after_default_init(&doc, &ApexCfgDocument::new(), &mutations)
            .unwrap();
    apply_binding_mutations(&mut doc, &mutations).unwrap();
    let output = doc.to_string();
    assert!(output.contains("bind_US_standard \"MOUSE2\" \"+zoom\" 0"));
    assert!(output.contains("bind_US_standard \"MWHEELUP\" \"+forward\" 1"));
    assert!(output.contains("bind_US_standard \"MWHEELDOWN\" \"+jump\" 1"));
    assert_eq!(output.matches("\"MOUSE2\"").count(), 1);
}

#[test]
fn rebases_legacy_three_binding_mutation_ids_after_default_initialization() {
    let source = ApexCfgDocument::from_content(
        concat!(
            "bind_US_standard \"MOUSE2\" \"+zoom\" 0\n",
            "bind_US_standard \"MWHEELUP\" \"+forward\" 1\n",
            "bind_US_standard \"MWHEELDOWN\" \"+jump\" 1\n",
        ),
        ApexFileEncoding::Utf8,
    )
    .unwrap();
    let source_groups = binding_groups(&source);
    let source_ids: Vec<_> = source_groups
        .iter()
        .map(|group| group.public.id.clone())
        .collect();
    assert_eq!(source_ids.len(), 3);

    let mut doc = source.clone();
    assert!(init_settings_doc_from_default(&mut doc).unwrap());
    let mutations = [
        ApexBindingMutation::Delete {
            id: source_ids[0].clone(),
        },
        ApexBindingMutation::Delete {
            id: source_ids[1].clone(),
        },
        ApexBindingMutation::Delete {
            id: source_ids[2].clone(),
        },
        ApexBindingMutation::Create {
            template_id: source_ids[0].clone(),
            input: "MOUSE2".into(),
            context: 0,
        },
        ApexBindingMutation::Create {
            template_id: source_ids[1].clone(),
            input: "MWHEELUP".into(),
            context: 1,
        },
        ApexBindingMutation::Create {
            template_id: source_ids[2].clone(),
            input: "MWHEELDOWN".into(),
            context: 1,
        },
    ];
    let rebased = rebase_binding_mutations_after_default_init(&doc, &source, &mutations).unwrap();
    apply_binding_mutations(&mut doc, &rebased).unwrap();

    let groups = binding_groups(&doc);
    assert!(groups.iter().any(|group| {
        group.public.input == "MOUSE2" && group.public.command == "+zoom"
    }));
    assert!(groups.iter().any(|group| {
        group.public.input == "MWHEELUP"
            && group.public.command == "+forward"
            && group.public.context == 1
    }));
    assert!(groups.iter().any(|group| {
        group.public.input == "MWHEELDOWN"
            && group.public.command == "+jump"
            && group.public.context == 1
    }));
    assert_eq!(
        groups
            .iter()
            .filter(|group| group.public.input.eq_ignore_ascii_case("MOUSE2"))
            .count(),
        1
    );
}

#[test]
fn rebased_update_keeps_its_template_when_target_input_is_unchanged() {
    let source = ApexCfgDocument::from_content(
        concat!(
            "bind_US_standard \"MOUSE2\" \"+zoom\" 0\n",
            "bind_US_standard \"MWHEELUP\" \"+forward\" 1\n",
            "bind_US_standard \"MWHEELDOWN\" \"+jump\" 1\n",
        ),
        ApexFileEncoding::Utf8,
    )
    .unwrap();
    let source_id = binding_groups(&source)
        .into_iter()
        .find(|group| group.public.command.eq_ignore_ascii_case("+forward"))
        .expect("legacy source should expose forward")
        .public
        .id
        .clone();
    let mut doc = source.clone();
    assert!(init_settings_doc_from_default(&mut doc).unwrap());

    let rebased = rebase_binding_mutations_after_default_init(
        &doc,
        &source,
        &[ApexBindingMutation::Update {
            id: source_id,
            input: "w".into(),
        }],
    )
    .unwrap();
    apply_binding_mutations(&mut doc, &rebased).unwrap();

    let forward = binding_groups(&doc)
        .into_iter()
        .find(|group| group.public.command.eq_ignore_ascii_case("+forward"))
        .expect("default forward binding should remain");
    assert_eq!(forward.public.input, "w");
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
