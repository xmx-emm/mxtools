#[test]
fn version_text_is_bounded_and_single_line() {
    assert!(valid_version_text("v3.0.4.57"));
    assert!(valid_version_text("25049128"));
    assert!(!valid_version_text(""));
    assert!(!valid_version_text("v1\nv2"));
    assert!(!valid_version_text(&"x".repeat(161)));
}

#[test]
fn steam_build_comes_from_the_requested_manifest_not_a_target_update() {
    let text = r#""AppState" { "appid" "578080" "installdir" "PUBG" "buildid" "25049128" "TargetBuildID" "99999" }"#;
    let (root, build) = parse_steam_install(Path::new("D:/Steam/steamapps"), text, 578080).unwrap();
    assert!(root.ends_with("common/PUBG"));
    assert_eq!(build.as_deref(), Some("25049128"));
    assert!(parse_steam_install(Path::new("D:/Steam/steamapps"), text, 1172470).is_none());
}

#[test]
fn invalid_install_directory_does_not_escape_the_library() {
    for name in ["../other", "C:/other", ""] {
        let text =
            format!(r#""AppState" {{ "appid" "578080" "installdir" "{name}" "buildid" "1" }}"#);
        assert!(parse_steam_install(Path::new("D:/Steam/steamapps"), &text, 578080).is_none());
    }
}
