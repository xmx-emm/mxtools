#[test]
fn reset_leaves_video_for_game_generation_and_restores_bindings() {
    let dir = TestDir::new("reset-video-generation");
    let video = dir.0.join("videoconfig.txt");
    let settings = dir.0.join("settings.cfg");
    let profile = dir.0.join("profile.cfg");
    fs::write(&video, "original video").unwrap();
    let before = capture_file(&video).unwrap();
    reset_default_files(&video, &settings, &profile).unwrap();
    assert!(!video.exists());
    assert!(fs::read_to_string(&settings)
        .unwrap()
        .contains("\"MOUSE4\" \"+offhand1\" 1"));
    assert!(fs::read_to_string(&settings)
        .unwrap()
        .contains("\"MOUSE5\" \"+offhand4\" 1"));
    assert!(fs::read_to_string(&profile)
        .unwrap()
        .contains("reticle_color \"\""));
    restore_file_verified(&before, &video).unwrap();
    assert_eq!(fs::read_to_string(&video).unwrap(), "original video");
}
