fn verify_published_channels(source: UpdateSource, endpoint: &str) {
    let expected = std::env::var("MXTOOLS_EXPECT_PUBLISHED_VERSION")
        .expect("Set the exact published version before running this network test");
    let baseline = std::env::var("MXTOOLS_UPDATE_FROM_VERSION")
        .expect("Set the installed version to simulate before running this network test");
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../../../src-tauri/tauri.conf.json")).unwrap();
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.package_info_mut().version = baseline.parse().unwrap();
    context.config_mut().plugins.0.insert(
        "updater".into(),
        serde_json::json!({"pubkey": config["plugins"]["updater"]["pubkey"]}),
    );
    let app = tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap();
    tauri::async_runtime::block_on(async {
        for target in ["windows-x86_64", "windows-x86_64-portable"] {
            let pending = check_source(app.updater_builder().target(target), source, endpoint)
                .await
                .expect("Published update check failed")
                .expect("Published source did not offer a newer version");
            assert_eq!(pending.update.version, expected);
            let bytes = download_verified(&pending.update, &mut |_, _| {})
                .await
                .expect("Published download or signature verification failed");
            assert!(bytes.starts_with(b"MZ"));
            println!(
                "Verified {baseline} -> {expected}: {endpoint}, {target}, {} signed bytes; no installation",
                bytes.len()
            );
        }
    });
}

#[test]
#[ignore = "Downloads signed public releases; requires explicit baseline and expected versions; never installs"]
fn github_channels_offer_signed_published_update() {
    verify_published_channels(UpdateSource::GitHub, GITHUB_ENDPOINT);
}

#[test]
#[ignore = "Downloads signed public releases; requires explicit baseline and expected versions; never installs"]
fn gitee_channels_offer_signed_published_update() {
    verify_published_channels(UpdateSource::Gitee, GITEE_ENDPOINT);
}
