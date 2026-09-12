fn miles_reset_fixture() -> (PathBuf, PathBuf) {
    let root = std::env::temp_dir().join(format!(
        "mxtools-miles-reset-{}-{}",
        std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
    ));
    fs::create_dir(&root).unwrap();
    let profile = root.join("profile.cfg");
    (root, profile)
}

#[test]
fn miles_reset_repairs_already_unchecked_launch_and_preserves_profile() {
    let (root, path) = miles_reset_fixture();
    let before = "// keep comment\r\nmiles_language \"japanese\"\r\ncl_fovScale \"1.5\"\r\nunknown_key \"keep\"\r\n";
    fs::write(&path, before).unwrap();
    // No previous launch override is needed to repair the reported stuck state.
    assert!(miles_language_reset_needed(&path, "+fps_max 240").unwrap());
    reset_miles_language_at_path(&path).unwrap();
    let expected = before.replace("\"japanese\"", "\"\"");
    assert_eq!(fs::read_to_string(&path).unwrap(), expected);
    assert!(!miles_language_reset_needed(&path, "").unwrap());
    reset_miles_language_at_path(&path).unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), expected);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn miles_reset_preserves_explicit_and_custom_voice_overrides() {
    let (root, path) = miles_reset_fixture();
    fs::write(&path, "miles_language \"japanese\"\n").unwrap();
    for launch in [
        "+miles_language japanese",
        "+fps_max 240 +miles_language english",
        "+MILES_LANGUAGE \"future_language\"",
        "+miles_language \"\"",
        "+exec autoexec.cfg +miles_language japanese",
    ] {
        assert!(!miles_language_reset_needed(&path, launch).unwrap(), "{launch}");
    }
    assert!(miles_language_reset_needed(&path, "+miles_language_statsd 1").unwrap());
    assert!(miles_language_reset_needed(&path, "+exec \"foo +miles_language bar.cfg\"").unwrap());
    assert!(miles_language_reset_needed(&path, "+exec \"+miles_language\"").unwrap());
    assert!(miles_language_reset_needed(&path, "+miles_language").unwrap());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn miles_reset_does_not_create_a_missing_profile_or_language_key() {
    let (root, path) = miles_reset_fixture();
    assert!(!miles_language_reset_needed(&path, "").unwrap());
    reset_miles_language_at_path(&path).unwrap();
    assert!(!path.exists());
    fs::write(&path, "cl_fovScale \"1.5\"\n").unwrap();
    reset_miles_language_at_path(&path).unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "cl_fovScale \"1.5\"\n");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn miles_reset_preserves_encoding_and_clears_duplicate_keys() {
    let (root, path) = miles_reset_fixture();
    let before = "miles_language \"english\"\r\nmiles_language \"japanese\"\r\n";
    let bytes = ApexFileEncoding::Utf16Le.encode(before);
    fs::write(&path, bytes).unwrap();
    reset_miles_language_at_path(&path).unwrap();
    let bytes = fs::read(&path).unwrap();
    assert!(bytes.starts_with(&[0xff, 0xfe]));
    let (text, _) = decode_bytes(&bytes).unwrap();
    assert_eq!(text, "miles_language \"\"\r\nmiles_language \"\"\r\n");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn miles_reset_reports_readonly_without_changing_profile() {
    let (root, path) = miles_reset_fixture();
    let before = b"miles_language \"japanese\"\n";
    fs::write(&path, before).unwrap();
    let original_permissions = fs::metadata(&path).unwrap().permissions();
    let mut readonly = original_permissions.clone();
    readonly.set_readonly(true);
    fs::set_permissions(&path, readonly).unwrap();
    let result = reset_miles_language_at_path(&path);
    fs::set_permissions(&path, original_permissions).unwrap();
    assert!(result.unwrap_err().contains("readOnly"));
    assert_eq!(fs::read(&path).unwrap(), before);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn miles_launch_only_reset_ignores_unrelated_unreadable_settings_report() {
    let (root, profile) = miles_reset_fixture();
    let settings = root.join("settings.cfg");
    // A directory at the settings path is unreadable as a config file on Windows.
    fs::create_dir(&settings).unwrap();
    fs::write(&profile, "miles_language \"japanese\"\n").unwrap();
    reset_miles_language_at_path(&profile).unwrap();
    assert_eq!(
        fs::read_to_string(&profile).unwrap(),
        "miles_language \"\"\n"
    );
    assert!(report_after_miles_reset(&settings, &profile, false)
        .unwrap()
        .is_none());
    assert!(report_after_miles_reset(&settings, &profile, true).is_err());
    fs::remove_dir_all(root).unwrap();
}
