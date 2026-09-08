#[test]
fn video_regeneration_backs_up_only_the_incomplete_file() {
    let dir = TestDir::new("video-regeneration");
    let history = dir.0.join("history");
    let video = dir.0.join("videoconfig.txt");
    let settings = dir.0.join("settings.cfg");
    let profile = dir.0.join("profile.cfg");
    fs::write(&settings, "personal bindings").unwrap();
    fs::write(&profile, "personal settings").unwrap();
    let incomplete = b"\"VideoConfig\"\n{\n\"setting.mat_vsync_mode\" \"0\"\n}\n";
    fs::write(&video, incomplete).unwrap();
    let mut permissions = fs::metadata(&video).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&video, permissions).unwrap();
    prepare_video_regeneration_at_path(&history, &video).unwrap();
    assert!(!video.exists());
    assert_eq!(fs::read_to_string(settings).unwrap(), "personal bindings");
    assert_eq!(fs::read_to_string(profile).unwrap(), "personal settings");
    let entries = load_entries(&history).unwrap();
    assert_eq!(entries.len(), 1);
    let entry = &entries[0];
    assert_eq!(entry.scopes, [ApexConfigScope::Video]);
    assert!(entry.launcher.is_none() && entry.settings.is_none() && entry.profile.is_none());
    let before = entry.video.as_ref().unwrap();
    assert_eq!(verified_bytes(before).unwrap(), incomplete);
    assert!(before.readonly);
    // Calling again while waiting for the game is harmless and adds no history.
    prepare_video_regeneration_at_path(&history, &video).unwrap();
    assert_eq!(load_entries(&history).unwrap().len(), 1);
    restore_file_verified(before, &video).unwrap();
    assert_eq!(fs::read(&video).unwrap(), incomplete);
    assert!(fs::metadata(&video).unwrap().permissions().readonly());
    clear_readonly(&video).unwrap();
}

#[test]
fn video_regeneration_refuses_a_baseline_generated_while_the_ui_was_open() {
    let dir = TestDir::new("video-regeneration-ready");
    let video = dir.0.join("videoconfig.txt");
    let content = "\"VideoConfig\"\n{\n\"setting.configversion\" \"10\"\n}\n";
    fs::write(&video, content).unwrap();
    assert_eq!(
        prepare_video_regeneration_at_path(&dir.0.join("history"), &video).unwrap_err(),
        "apex.videoConfigAlreadyInitialized"
    );
    assert_eq!(fs::read_to_string(&video).unwrap(), content);
    assert!(!dir.0.join("history").exists());
}
