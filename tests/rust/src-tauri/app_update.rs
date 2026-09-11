use std::io::{Read, Write};
use std::net::TcpListener;

const TEST_KEY: &str = include_str!("../../fixtures/updater/test.pub");
const TEST_SIGNATURE: &str = include_str!("../../fixtures/updater/payload.txt.sig");
const TEST_PAYLOAD: &[u8] = include_bytes!("../../fixtures/updater/payload.txt");

fn server(responses: Vec<(u16, Vec<u8>)>) -> String {
    let socket = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = socket.local_addr().unwrap();
    std::thread::spawn(move || {
        for (status, body) in responses {
            let (mut client, _) = socket.accept().unwrap();
            client
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = [0; 4096];
            let _ = client.read(&mut request);
            write!(
                client,
                "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .unwrap();
            let _ = client.write_all(&body);
        }
    });
    format!("http://{address}")
}

fn manifest(version: &str, source: UpdateSource, signature: &str) -> Vec<u8> {
    let base = if source == UpdateSource::Gitee {
        "https://gitee.com/mengxin_code/mxtools"
    } else {
        "https://github.com/xmx-emm/mxtools"
    };
    serde_json::to_vec(
        &serde_json::json!({"version": version, "platforms": {"windows-x86_64": {
            "url": format!("{base}/releases/download/v{version}/MxTools_{version}_x64_setup.exe"),
            "signature": signature.trim(),
        }}}),
    )
    .unwrap()
}

fn app(key: &str) -> tauri::App<tauri::test::MockRuntime> {
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.package_info_mut().version = "0.0.7".parse().unwrap();
    context.config_mut().plugins.0.insert(
        "updater".into(),
        serde_json::json!({
            "pubkey": key.trim(), "dangerousInsecureTransportProtocol": true,
            "windows": {"installMode": "quiet"},
        }),
    );
    tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap()
}

#[test]
fn accepts_only_matching_https_release_assets() {
    for (source, valid) in [
        (
            UpdateSource::GitHub,
            "https://github.com/xmx-emm/mxtools/releases/download/v0.0.8/app.exe",
        ),
        (
            UpdateSource::Gitee,
            "https://gitee.com/mengxin_code/mxtools/releases/download/v0.0.8/app.exe",
        ),
    ] {
        assert!(valid_update_url(&valid.parse().unwrap(), source));
        for bad in [
            valid.replace("https:", "http:"),
            valid.replace("mxtools/", "other/"),
            format!("{valid}?token=x"),
            valid.replace("https://", "https://user@"),
            valid.replace(".com/", ".com:8443/"),
        ] {
            assert!(!valid_update_url(&bad.parse().unwrap(), source));
        }
    }
    assert!(!valid_update_url(
        &"https://github.com/xmx-emm/mxtools/releases/download/v1/a.exe"
            .parse()
            .unwrap(),
        UpdateSource::Gitee
    ));
}

#[test]
fn check_falls_back_after_network_or_invalid_json_and_rejects_downgrades() {
    let app = app(TEST_KEY);
    tauri::async_runtime::block_on(async {
        for bad in [b"invalid JSON".to_vec(), b"{}".to_vec()] {
            let first = server(vec![(200, bad)]);
            let second = server(vec![(
                200,
                manifest("0.0.8", UpdateSource::GitHub, TEST_SIGNATURE),
            )]);
            let pending = check_candidates(
                || app.updater_builder().no_proxy(),
                &[
                    (UpdateSource::Gitee, &first),
                    (UpdateSource::GitHub, &second),
                ],
            )
            .await
            .unwrap()
            .unwrap();
            assert_eq!(pending.update.version, "0.0.8");
            assert!(pending.source == UpdateSource::GitHub);
        }
        let second = server(vec![(
            200,
            manifest("0.0.8", UpdateSource::GitHub, TEST_SIGNATURE),
        )]);
        assert!(check_candidates(
            || app.updater_builder().no_proxy(),
            &[
                (UpdateSource::Gitee, "http://127.0.0.1:1"),
                (UpdateSource::GitHub, &second)
            ]
        )
        .await
        .unwrap()
        .is_some());
        for version in ["0.0.7", "0.0.6"] {
            let endpoint = server(vec![(
                200,
                manifest(version, UpdateSource::Gitee, TEST_SIGNATURE),
            )]);
            assert!(check_source(
                app.updater_builder().no_proxy(),
                UpdateSource::Gitee,
                &endpoint
            )
            .await
            .unwrap()
            .is_none());
        }
    });
}

#[test]
fn real_plugin_verifies_download_and_rejects_modified_bytes() {
    let app = app(TEST_KEY);
    tauri::async_runtime::block_on(async {
        let endpoint = server(vec![(
            200,
            manifest("0.0.8", UpdateSource::Gitee, TEST_SIGNATURE),
        )]);
        let mut pending = check_source(
            app.updater_builder().no_proxy(),
            UpdateSource::Gitee,
            &endpoint,
        )
        .await
        .unwrap()
        .unwrap();
        let mut bad = TEST_PAYLOAD.to_vec();
        bad[0] ^= 1;
        pending.update.download_url = server(vec![(200, TEST_PAYLOAD.to_vec()), (200, bad)])
            .parse()
            .unwrap();
        assert_eq!(
            download_verified(&pending.update, &mut |_, _| {})
                .await
                .unwrap(),
            TEST_PAYLOAD
        );
        assert!(download_verified(&pending.update, &mut |_, _| {})
            .await
            .is_err());
    });
}

#[test]
fn download_fallback_refuses_a_different_version_or_signature() {
    let app = app(TEST_KEY);
    tauri::async_runtime::block_on(async {
        for (version, signature) in [("0.0.9", TEST_SIGNATURE), ("0.0.8", "different-signature")] {
            let endpoint = server(vec![(
                200,
                manifest("0.0.8", UpdateSource::Gitee, TEST_SIGNATURE),
            )]);
            let mut pending = check_source(
                app.updater_builder().no_proxy(),
                UpdateSource::Gitee,
                &endpoint,
            )
            .await
            .unwrap()
            .unwrap();
            pending.update.download_url = server(vec![(503, vec![])]).parse().unwrap();
            let fallback = server(vec![(
                200,
                manifest(version, UpdateSource::GitHub, signature),
            )]);
            assert!(download_with_fallback(
                pending,
                || app.updater_builder().no_proxy(),
                &fallback,
                |_, _| {}
            )
            .await
            .is_err());
        }
    });
}

// Invoked against the actual signed NSIS before publishing. Installation is opt-in
// and restricted to an ephemeral GitHub Windows runner, never a local test run.
#[test]
#[ignore = "requires signed release artifacts and an isolated Windows runner"]
fn verify_release_installer_and_upgrade() {
    let directory = std::path::PathBuf::from(std::env::var("MXTOOLS_VERIFY_RELEASE_DIR").unwrap());
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../../../src-tauri/tauri.conf.json")).unwrap();
    let key = config["plugins"]["updater"]["pubkey"].as_str().unwrap();
    let app = app(key);
    let data: serde_json::Value =
        serde_json::from_slice(&std::fs::read(directory.join("latest.json")).unwrap()).unwrap();
    let url =
        reqwest::Url::parse(data["platforms"]["windows-x86_64"]["url"].as_str().unwrap()).unwrap();
    let filename = url.path_segments().unwrap().next_back().unwrap();
    let bytes = std::fs::read(directory.join(filename)).unwrap();
    let endpoint = server(vec![(200, serde_json::to_vec(&data).unwrap())]);
    tauri::async_runtime::block_on(async {
        let mut pending = check_source(
            app.updater_builder().no_proxy(),
            UpdateSource::GitHub,
            &endpoint,
        )
        .await
        .unwrap()
        .unwrap();
        let mut corrupted = bytes.clone();
        corrupted[0] ^= 1;
        pending.update.download_url = server(vec![(200, bytes.clone()), (200, corrupted)])
            .parse()
            .unwrap();
        let verified = download_verified(&pending.update, &mut |_, _| {})
            .await
            .unwrap();
        assert_eq!(verified, bytes);
        assert!(download_verified(&pending.update, &mut |_, _| {})
            .await
            .is_err());
        if std::env::var("MXTOOLS_RUN_INSTALL_TEST").as_deref() == Ok("1") {
            assert_eq!(std::env::var("GITHUB_ACTIONS").as_deref(), Ok("true"));
            std::fs::write(
                std::env::var("MXTOOLS_INSTALL_TEST_MARKER").unwrap(),
                "signature accepted; tampering rejected",
            )
            .unwrap();
            pending.update.install(verified).unwrap();
            panic!("Windows updater should exit after launching the installer");
        }
    });
}
