fn reset_test_defaults(language: &str) -> apex_defaults::ApexDefaultConfigs {
    use apex_defaults::video::{DisplayMode, Hardware};
    apex_defaults::from_inputs(
        include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../tests/fixtures/apex/dxsupport-defaults.cfg"
        )),
        &Hardware {
            system_memory_mb: 32768,
            video_memory_mb: 8192,
            vendor_id: 0x10de,
            device_id: 0x2684,
            intel_non_uma: false,
            desktop_width: 1920,
            desktop_height: 1080,
            modes: vec![DisplayMode {
                width: 1920,
                height: 1080,
                numerator: 144,
                denominator: 1,
            }],
        },
        language,
    )
    .unwrap()
}

#[test]
fn reset_creates_all_missing_files_and_repeated_reset_returns_verified_defaults() {
    for kind in ["steam", "ea"] {
        let dir = TestDir::new("reset-all-missing");
        let history = dir.0.join("history");
        let video = dir.0.join("local/videoconfig.txt");
        let settings = dir.0.join("local/settings.cfg");
        let profile = dir.0.join("profile/profile.cfg");
        let paths = (video.as_path(), settings.as_path(), profile.as_path());
        let defaults = reset_test_defaults(if kind == "steam" { "english" } else { "zh_CN" });
        let result = reset_at_paths(
            &history,
            launcher(kind, "1"),
            paths,
            &defaults,
            || Ok(String::new()),
            |_| Ok(()),
        )
        .unwrap();
        assert!(result.history_entry.is_some());
        assert!(result.pending_scopes.is_empty());
        assert_eq!(result.video_config.len(), 42);
        assert_eq!(result.video_config["setting.configversion"], "10");
        assert_eq!(
            result.game_settings_report.profile.values["closecaption"],
            if kind == "steam" { "0" } else { "1" }
        );
        assert_eq!(
            fs::read_to_string(&settings)
                .unwrap()
                .lines()
                .filter(|line| line.starts_with("bind_US_standard ")
                    || line.starts_with("bind_held_US_standard "))
                .count(),
            107
        );
        for (input, command) in [
            ("MOUSE4", "+offhand1"),
            ("MOUSE5", "+offhand4"),
            ("MOUSE2", "+toggle_zoom"),
        ] {
            assert!(result
                .game_settings_report
                .bindings
                .iter()
                .any(|b| b.input == input && b.command == command));
        }
        let again = reset_at_paths(
            &history,
            launcher(kind, "1"),
            paths,
            &defaults,
            || Ok(String::new()),
            |_| panic!("no-op must not write launch options"),
        )
        .unwrap();
        assert!(again.history_entry.is_none());
        assert_eq!(again.video_config, result.video_config);
        assert_eq!(
            again.game_settings_report.settings.revision,
            result.game_settings_report.settings.revision
        );
    }
}

#[test]
fn reset_saves_original_readonly_bytes_and_makes_every_config_writable() {
    let dir = TestDir::new("reset-readonly");
    let history = dir.0.join("history");
    let paths = [
        dir.0.join("videoconfig.txt"),
        dir.0.join("settings.cfg"),
        dir.0.join("profile.cfg"),
    ];
    for path in &paths {
        fs::write(path, b"original\r\n\0").unwrap();
        let mut permission = fs::metadata(path).unwrap().permissions();
        permission.set_readonly(true);
        fs::set_permissions(path, permission).unwrap();
    }
    let options = std::cell::RefCell::new("+fps_max 100".to_string());
    let result = reset_at_paths(
        &history,
        launcher("ea", "1"),
        (&paths[0], &paths[1], &paths[2]),
        &reset_test_defaults("zh_CN"),
        || Ok(options.borrow().clone()),
        |v| {
            *options.borrow_mut() = v.into();
            Ok(())
        },
    )
    .unwrap();
    let entry = load_entry_by_id(&history, &result.history_entry.unwrap().id).unwrap();
    assert_eq!(entry.launch_options.as_deref(), Some("+fps_max 100"));
    assert!(options.borrow().is_empty());
    for (path, stored) in paths.iter().zip([
        entry.video.unwrap(),
        entry.settings.unwrap(),
        entry.profile.unwrap(),
    ]) {
        assert!(!fs::metadata(path).unwrap().permissions().readonly());
        assert_eq!(verified_bytes(&stored).unwrap(), b"original\r\n\0");
        assert!(stored.readonly);
        restore_file_verified(&stored, path).unwrap();
        assert_eq!(fs::read(path).unwrap(), b"original\r\n\0");
        clear_readonly(path).unwrap();
    }
}

#[test]
fn reset_readback_failure_rolls_back_all_files_and_launch_options() {
    let dir = TestDir::new("reset-readback-failure");
    let history = dir.0.join("history");
    let paths = [
        dir.0.join("videoconfig.txt"),
        dir.0.join("settings.cfg"),
        dir.0.join("profile.cfg"),
    ];
    fs::write(&paths[0], b"original video").unwrap();
    fs::write(&paths[2], b"original profile").unwrap();
    let options = std::cell::RefCell::new("+fps_max 100".to_string());
    let reads = std::cell::Cell::new(0);
    let result = reset_at_paths(
        &history,
        launcher("steam", "1"),
        (&paths[0], &paths[1], &paths[2]),
        &reset_test_defaults("english"),
        || {
            reads.set(reads.get() + 1);
            if reads.get() == 2 {
                Err("injected launch readback failure".into())
            } else {
                Ok(options.borrow().clone())
            }
        },
        |v| {
            *options.borrow_mut() = v.into();
            Ok(())
        },
    );
    assert_eq!(result.unwrap_err(), "injected launch readback failure");
    assert_eq!(fs::read(&paths[0]).unwrap(), b"original video");
    assert!(!paths[1].exists());
    assert_eq!(fs::read(&paths[2]).unwrap(), b"original profile");
    assert_eq!(*options.borrow(), "+fps_max 100");
    assert_eq!(fs::read_dir(history).unwrap().count(), 0);
}

#[test]
fn reset_keeps_recovery_history_if_launch_rollback_cannot_be_verified() {
    let dir = TestDir::new("reset-rollback-failure");
    let history = dir.0.join("history");
    let paths = [
        dir.0.join("videoconfig.txt"),
        dir.0.join("settings.cfg"),
        dir.0.join("profile.cfg"),
    ];
    let reads = std::cell::Cell::new(0);
    let error = reset_at_paths(
        &history,
        launcher("ea", "1"),
        (&paths[0], &paths[1], &paths[2]),
        &reset_test_defaults("zh_CN"),
        || {
            reads.set(reads.get() + 1);
            if reads.get() == 1 {
                Ok("original".into())
            } else {
                Err("injected read failure".into())
            }
        },
        |v| {
            if v.is_empty() {
                Ok(())
            } else {
                Err("injected rollback failure".into())
            }
        },
    )
    .unwrap_err();
    assert!(error.contains("apex.history.errors.rollbackFailed"));
    assert_eq!(fs::read_dir(history).unwrap().count(), 1);
    assert!(paths.iter().all(|path| !path.exists()));
}

#[cfg(windows)]
#[test]
fn reset_write_failure_after_video_restores_the_entire_transaction() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = TestDir::new("reset-locked-file");
    let history = dir.0.join("history");
    let paths = [
        dir.0.join("videoconfig.txt"),
        dir.0.join("settings.cfg"),
        dir.0.join("profile.cfg"),
    ];
    for path in &paths {
        fs::write(path, b"before").unwrap();
    }
    let handle = std::cell::RefCell::new(None);
    let options = std::cell::RefCell::new("before-launch".to_string());
    let error = reset_at_paths(
        &history,
        launcher("ea", "1"),
        (&paths[0], &paths[1], &paths[2]),
        &reset_test_defaults("zh_CN"),
        || Ok(options.borrow().clone()),
        |v| {
            if v.is_empty() {
                *handle.borrow_mut() = Some(
                    OpenOptions::new()
                        .read(true)
                        .share_mode(1)
                        .open(&paths[1])
                        .unwrap(),
                );
            } else {
                handle.borrow_mut().take();
            }
            *options.borrow_mut() = v.into();
            Ok(())
        },
    )
    .unwrap_err();
    assert!(!error.contains("rollbackFailed"), "{error}");
    for path in &paths {
        assert_eq!(fs::read(path).unwrap(), b"before");
    }
    assert_eq!(*options.borrow(), "before-launch");
    assert_eq!(fs::read_dir(history).unwrap().count(), 0);
}

// Frontend integration uses the real reset transaction and config readers/writers
// in a child with an isolated USERPROFILE. Only launcher storage is a fixture.
#[test]
#[ignore = "Vitest reset/preset bridge; requires isolated Saved Games and fixture launch storage"]
fn reset_preset_native_bridge() {
    let root = PathBuf::from(std::env::var_os("MXTOOLS_VIDEO_TEST_ROOT").unwrap());
    let video = apex::apex_video_config_path().unwrap();
    let (settings, profile) = apex_settings::apex_game_settings_paths().unwrap();
    assert_eq!(
        video,
        root.join("Saved Games/Respawn/Apex/local/videoconfig.txt")
    );
    assert_eq!(
        settings,
        root.join("Saved Games/Respawn/Apex/local/settings.cfg")
    );
    assert_eq!(
        profile,
        root.join("Saved Games/Respawn/Apex/profile/profile.cfg")
    );
    let input: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join("reset-request.json")).unwrap()).unwrap();
    let kind = input["kind"].as_str().unwrap();
    assert!(["steam", "ea"].contains(&kind));
    let launch = root.join(format!("{kind}-launch.txt"));
    let read = || Ok(fs::read_to_string(&launch).unwrap_or_default());
    let write = |value: &str| fs::write(&launch, value).map_err(|e| e.to_string());
    let result = match input["operation"].as_str().unwrap() {
        "reset" => serde_json::to_value(
            reset_at_paths(
                &root.join("history"),
                launcher(kind, "1"),
                (&video, &settings, &profile),
                &reset_test_defaults(if kind == "steam" { "english" } else { "zh_CN" }),
                read,
                write,
            )
            .unwrap(),
        )
        .unwrap(),
        operation => {
            if operation == "apply" {
                let request: ApexConfigMutationRequest =
                    serde_json::from_value(input["request"].clone()).unwrap();
                if let Some(options) = request.launch_options {
                    write(&options).unwrap();
                }
                if !request.video_updates.is_empty() {
                    apex::patch_video_config_sync(&request.video_updates).unwrap();
                }
                if let Some(game) = request.game_settings {
                    apex_settings::apply_request_without_history(game).unwrap();
                }
            }
            if let Some(locked) = input.get("locked").and_then(|v| v.as_bool()) {
                windows_tool::game::apex::set_videoconfig_readonly(locked).unwrap();
            }
            serde_json::json!({
                "historyEntry": null, "changedScopes": ["launch", "video", "gameSettings"],
                "launchOptions": read().unwrap(), "videoConfig": apex::read_video_config_sync().unwrap(),
                "gameSettingsReport": apex_settings::load_report().unwrap(),
                "readonly": windows_tool::game::apex::is_videoconfig_readonly().unwrap(),
            })
        }
    };
    fs::write(
        root.join("reset-result.json"),
        serde_json::to_vec(&result).unwrap(),
    )
    .unwrap();
}
