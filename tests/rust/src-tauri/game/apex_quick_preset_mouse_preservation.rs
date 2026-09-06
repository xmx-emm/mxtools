#[test]
fn quick_preset_preserves_middle_and_skill_side_buttons() {
    let mut doc = ApexCfgDocument::from_content(
        crate::game::apex_defaults::APEX_DEFAULT_SETTINGS_CFG,
        ApexFileEncoding::Utf8,
    )
    .unwrap();
    assert!(!init_settings_doc_from_default(&mut doc).unwrap());
    let groups = binding_groups(&doc);
    let id = |input: &str| {
        groups
            .iter()
            .find(|group| group.public.input == input)
            .unwrap()
            .public
            .id
            .clone()
    };
    apply_binding_mutations(
        &mut doc,
        &[
            ApexBindingMutation::Delete { id: id("MOUSE2") },
            ApexBindingMutation::Delete { id: id("MWHEELUP") },
            ApexBindingMutation::Delete { id: id("MWHEELDOWN") },
            ApexBindingMutation::Create {
                template_id: id("MOUSE2"),
                input: "MOUSE2".into(),
                context: 0,
            },
            ApexBindingMutation::Create {
                template_id: id("w"),
                input: "MWHEELUP".into(),
                context: 1,
            },
            ApexBindingMutation::Create {
                template_id: id("SPACE"),
                input: "MWHEELDOWN".into(),
                context: 1,
            },
        ],
    )
    .unwrap();
    // Reparse the serialized file, not only the mutation's in-memory model.
    let reloaded = ApexCfgDocument::from_content(&doc.to_string(), ApexFileEncoding::Utf8).unwrap();
    let result = binding_groups(&reloaded);
    for (input, command, context) in [
        ("MOUSE3", "+ping", 0),
        ("MOUSE4", "+offhand1", 1),
        ("MOUSE5", "+offhand4", 1),
    ] {
        let found = result.iter().find(|group| group.public.input == input).unwrap();
        assert_eq!(found.public.command, command);
        assert_eq!(found.public.context, context);
    }
}
