#[test]
fn subtitle_language_comes_from_game_settings() {
    for language in ["english", "en_US"] {
        assert!(super::super::profile_for_language(language)
            .unwrap()
            .contains("closecaption \"0\""));
    }
    for language in [
        "schinese", "zh_CN", "japanese", "ja_JP", "tchinese", "zh_TW",
    ] {
        assert!(super::super::profile_for_language(language)
            .unwrap()
            .contains("closecaption \"1\""));
    }
    for unknown in ["", "zh-CN", "system", "unknown"] {
        assert!(super::super::profile_for_language(unknown).is_err());
    }
    let manifest = r#""AppState" { "UserConfig" { "language" "japanese" } "MountedConfig" { "language" "english" } }"#;
    assert_eq!(steam_manifest_language(manifest).unwrap(), "japanese");
    assert_eq!(
        steam_manifest_language(r#""AppState" { "MountedConfig" { "language" "schinese" } }"#)
            .unwrap(),
        "schinese"
    );
    assert!(steam_manifest_language(r#""AppState" {}"#).is_err());
}

#[test]
fn changed_optional_tier_resources_are_rejected_before_initialization() {
    let root = std::env::temp_dir().join(format!(
        "mxtools-default-resources-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(root.join("bin")).unwrap();
    fs::write(root.join("bin/dxsupport.cfg"), "fixture").unwrap();
    assert_eq!(initialization_resources(&root).unwrap(), "fixture");
    fs::create_dir(root.join("cfg")).unwrap();
    fs::write(root.join("cfg/GPU_LEVEL_3_PC.EKV"), "unverified").unwrap();
    assert_eq!(
        initialization_resources(&root).unwrap_err(),
        "apex.history.errors.defaultResourcesChanged"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
#[ignore = "read-only installed Steam/EA and Windows hardware probe; creates no game files"]
fn installed_defaults_read_only_probe() {
    let hw = hardware().unwrap();
    let accounts = [("steam", "1"), ("ea", "1")];
    for (kind, id) in accounts {
        let launcher = ApexLauncherRef {
            kind: kind.into(),
            id: id.into(),
            name: String::new(),
        };
        let (root, language) = installation(&launcher).unwrap();
        let support = initialization_resources(&root).unwrap();
        let text = super::super::video::generate(&support, &hw).unwrap();
        let profile = super::super::profile_for_language(&language).unwrap();
        assert!(text.contains("\"setting.configversion\"\t\t\"10\""));
        assert!(profile.contains("closecaption"));
        println!("{kind}: {language}; memory={} MiB; vram={} MiB; GPU={:04x}:{:04x}; desktop={}x{}; modes={}; generated {} video fields in memory",
            hw.system_memory_mb, hw.video_memory_mb, hw.vendor_id, hw.device_id,
            hw.desktop_width, hw.desktop_height, hw.modes.len(), text.lines().filter(|l| l.contains("setting.")).count());
    }
}
