#[test]
#[ignore = "Requires signed release artifacts; downloads from loopback only, never installs"]
fn verify_signed_portable_release() {
    let directory = std::path::PathBuf::from(std::env::var("MXTOOLS_VERIFY_RELEASE_DIR").unwrap());
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../../../src-tauri/tauri.conf.json")).unwrap();
    let app = app(config["plugins"]["updater"]["pubkey"].as_str().unwrap());
    let data = std::fs::read(directory.join("latest.json")).unwrap();
    tauri::async_runtime::block_on(async {
        let endpoint = server(vec![(200, data)]);
        let mut pending = check_source(
            app.updater_builder()
                .target("windows-x86_64-portable")
                .no_proxy(),
            UpdateSource::GitHub,
            &endpoint,
        )
        .await
        .unwrap()
        .unwrap();
        let name = pending
            .update
            .download_url
            .path_segments()
            .unwrap()
            .next_back()
            .unwrap();
        let bytes = std::fs::read(directory.join(name)).unwrap();
        let mut corrupt = bytes.clone();
        corrupt[0] ^= 1;
        pending.update.download_url = server(vec![(200, bytes.clone()), (200, corrupt)])
            .parse()
            .unwrap();
        assert_eq!(
            download_verified(&pending.update, &mut |_, _| {})
                .await
                .unwrap(),
            bytes
        );
        assert!(download_verified(&pending.update, &mut |_, _| {})
            .await
            .is_err());
    });
}
#[test]
fn portable_target_cannot_select_an_installer_or_a_different_version_path() {
    let app = app(TEST_KEY);
    tauri::async_runtime::block_on(async {
        for (filename, valid) in [
            ("v0.0.8/MxTools_0.0.8_x64_portable.exe", true),
            ("v0.0.8/MxTools_0.0.8_x64_setup.exe", false),
            ("v0.0.7/MxTools_0.0.7_x64_portable.exe", false),
        ] {
            let body = serde_json::to_vec(&serde_json::json!({"version": "0.0.8", "platforms": {
                "windows-x86_64": {"url": "https://github.com/xmx-emm/mxtools/releases/download/v0.0.8/MxTools_0.0.8_x64_setup.exe", "signature": "installer"},
                "windows-x86_64-portable": {"url": format!("https://github.com/xmx-emm/mxtools/releases/download/{filename}"), "signature": TEST_SIGNATURE.trim()}
            }})).unwrap();
            let endpoint = server(vec![(200, body)]);
            let result = check_source(
                app.updater_builder()
                    .target("windows-x86_64-portable")
                    .no_proxy(),
                UpdateSource::GitHub,
                &endpoint,
            )
            .await;
            if valid {
                let mut pending = result.unwrap().unwrap();
                assert_eq!(pending.update.target, "windows-x86_64-portable");
                pending.update.download_url =
                    server(vec![(200, TEST_PAYLOAD.to_vec())]).parse().unwrap();
                assert_eq!(
                    download_verified(&pending.update, &mut |_, _| {})
                        .await
                        .unwrap(),
                    TEST_PAYLOAD
                );
            } else {
                assert!(result.is_err());
            }
        }
    });
}
