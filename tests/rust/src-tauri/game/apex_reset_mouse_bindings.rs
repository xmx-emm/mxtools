#[test]
fn reset_template_includes_mouse_skill_slots_and_keeps_primary_keys() {
    let (content, encoding) = decode_bytes(APEX_DEFAULT_SETTINGS_CFG.as_bytes()).unwrap();
    let doc = ApexCfgDocument::from_content(&content, encoding).unwrap();
    let text = doc.to_string();
    for line in [
        "bind_US_standard \"MOUSE3\" \"+ping\" 0",
        "bind_US_standard \"MOUSE4\" \"+offhand1\" 1",
        "bind_US_standard \"MOUSE5\" \"+offhand4\" 1",
        "bind_US_standard \"q\" \"+offhand1\" 0",
        "bind_US_standard \"z\" \"+offhand4\" 0",
    ] {
        assert_eq!(text.lines().filter(|value| *value == line).count(), 1);
    }
}
