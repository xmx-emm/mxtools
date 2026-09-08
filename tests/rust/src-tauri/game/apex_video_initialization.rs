// Runs the production Saved Games reader/writer in a CHILD process whose
// USERPROFILE points to a temporary directory. The parent environment is never
// changed, so concurrent tests and the user's game files stay isolated.
#[test]
fn video_initialization_file_workflow() {
    let root = std::env::temp_dir().join(format!(
        "mxtools-video-initialization-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&root).unwrap();
    let result = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "game::apex::tests::video_initialization_child",
            "--ignored",
            "--nocapture",
        ])
        .env("USERPROFILE", &root)
        .env("MXTOOLS_VIDEO_TEST_ROOT", &root)
        .output()
        .unwrap();
    std::fs::remove_dir_all(&root).unwrap();
    assert!(
        result.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

#[test]
#[ignore = "only run by video_initialization_file_workflow with an isolated USERPROFILE"]
fn video_initialization_child() {
    let root = PathBuf::from(std::env::var_os("MXTOOLS_VIDEO_TEST_ROOT").unwrap());
    let path = apex_video_config_path().unwrap();
    assert_eq!(
        path,
        root.join("Saved Games/Respawn/Apex/local/videoconfig.txt")
    );
    let updates = HashMap::from([
        ("setting.mat_vsync_mode".into(), "0".into()),
        ("setting.mat_backbuffer_count".into(), "1".into()),
        ("setting.shadow_enable".into(), "0".into()),
        ("setting.shadow_depth_dimen_min".into(), "0".into()),
        ("setting.shadow_depth_upres_factor_max".into(), "0".into()),
    ]);

    // Missing after reset: no partial replacement and no .bak is created.
    assert_eq!(
        patch_video_config_sync(&updates).unwrap_err(),
        "apex.videoConfigNeedsGeneration"
    );
    assert!(!path.exists());
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    for content in [
        "".to_string(),
        "\"VideoConfig\"\n{\n\t\"setting.mat_vsync_mode\"\t\"0\"\n}\n".into(),
    ] {
        std::fs::write(&path, &content).unwrap();
        assert!(patch_video_config_sync(&updates).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), content);
        assert!(!path.with_extension("txt.bak").exists());
    }

    // Game-generated baseline, including game-owned fields and an unknown
    // future setting. A full write must preserve them and the original .bak.
    let content = "\"VideoConfig\"\r\n{\r\n\t\"setting.configversion\"\t\t\"10\"\r\n\t\"setting.new_shadow_settings\"\t\t\"1\"\r\n\t\"setting.sound_volume\"\t\t\"0.35\"\r\n\t\"setting.future_setting\"\t\t\"keep\"\r\n\t\"setting.mat_vsync_mode\"\t\t\"3\"\r\n\t\"setting.shadow_enable\"\t\t\"1\"\r\n}\r\n";
    std::fs::write(&path, content).unwrap();
    set_videoconfig_readonly(true).unwrap();
    patch_video_config_sync(&updates).unwrap();
    let readback = read_initialized_video_config_sync().unwrap();
    for (key, value) in &updates {
        assert_eq!(readback.get(key), Some(value));
    }
    assert_eq!(readback["setting.configversion"], "10");
    assert_eq!(readback["setting.new_shadow_settings"], "1");
    assert_eq!(readback["setting.sound_volume"], "0.35");
    assert_eq!(readback["setting.future_setting"], "keep");
    assert!(is_videoconfig_readonly().unwrap());
    assert_eq!(
        std::fs::read_to_string(path.with_extension("txt.bak")).unwrap(),
        content
    );
    set_videoconfig_readonly(false).unwrap();
    // A read-only source can copy its attribute to the legacy .bak on Windows.
    let backup = path.with_extension("txt.bak");
    let mut permissions = std::fs::metadata(&backup).unwrap().permissions();
    #[allow(clippy::permissions_set_readonly_false)]
    permissions.set_readonly(false);
    std::fs::set_permissions(backup, permissions).unwrap();
}

#[test]
fn video_initialization_uses_the_game_version_without_hardcoding_it() {
    for version in ["1", "10", "11", "4294967295"] {
        assert!(video_config_is_initialized(&HashMap::from([(
            "setting.configversion".into(),
            version.into()
        )])));
    }
    for version in ["", "0", "-1", "+10", "10.0", " 10", "4294967296", "bad"] {
        assert!(!video_config_is_initialized(&HashMap::from([(
            "setting.configversion".into(),
            version.into()
        )])));
    }
}

#[test]
#[ignore = "Vitest native video integration bridge; requires an isolated USERPROFILE"]
fn video_preset_native_bridge() {
    let root = PathBuf::from(std::env::var_os("MXTOOLS_VIDEO_TEST_ROOT").unwrap());
    assert_eq!(
        apex_video_config_path().unwrap(),
        root.join("Saved Games/Respawn/Apex/local/videoconfig.txt")
    );
    let input: serde_json::Value =
        serde_json::from_slice(&std::fs::read(root.join("video-request.json")).unwrap()).unwrap();
    if let Some(updates) = input.get("updates") {
        patch_video_config_sync(&serde_json::from_value(updates.clone()).unwrap()).unwrap();
    }
    if let Some(locked) = input.get("locked").and_then(|value| value.as_bool()) {
        if locked {
            read_initialized_video_config_sync().unwrap();
        }
        set_videoconfig_readonly(locked).unwrap();
    }
    let result = serde_json::json!({
        "values": read_video_config_sync().unwrap(),
        "readonly": is_videoconfig_readonly().unwrap(),
    });
    std::fs::write(
        root.join("video-result.json"),
        serde_json::to_vec(&result).unwrap(),
    )
    .unwrap();
}
