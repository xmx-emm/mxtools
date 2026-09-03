#[test]
fn language_slug_mapping_complete() {
    for miles in [
        "english", "french", "german", "italian", "japanese", "koreana", "polish", "russian",
        "schinese", "mandarin", "spanish",
    ] {
        let slug = ea_language_slug(miles).unwrap_or_else(|| panic!("missing slug: {miles}"));
        assert!(ea_slug_to_locale(slug).is_some(), "missing locale: {slug}");
    }
    assert_eq!(ea_locale_to_slug("zh_CN"), Some("zh-hans"));
    assert_eq!(ea_locale_to_slug("ja_JP"), Some("ja"));
}

#[test]
fn parse_progress_payloads_extracts_bytes() {
    let items = vec![
        r#"{"offerId":"Origin.OFR.50.0002694","bytesDownloaded":100,"bytesTotal":300}"#.to_string(),
        "not json".to_string(),
        r#"{"bytesDownloaded":250,"bytesTotal":300}"#.to_string(),
    ];
    assert_eq!(parse_progress_payloads(&items), Some((250, 300)));
    assert_eq!(parse_progress_payloads(&[]), None);
}

#[test]
fn recognizes_only_known_ea_client_processes_as_restartable() {
    assert!(is_ea_client_process_name("EADesktop.exe"));
    assert!(is_ea_client_process_name("EABackgroundAgent.exe"));
    assert!(!is_ea_client_process_name("r5apex.exe"));
    assert!(!is_ea_client_process_name("other-ea-game.exe"));
}

/// Read-only live bridge probe. Requires EA App running with its debug port and an account.
/// Manual command: `cargo test --lib live_ea_readonly_probe -- --ignored --nocapture`.
#[test]
#[ignore]
fn live_ea_readonly_probe() {
    tauri::async_runtime::block_on(async {
        let targets = list_targets(EA_CEF_PORT).await.expect("list EA CEF targets");
        let page_target = targets
            .iter()
            .find(|target| target.kind == "page" && target.url.contains("pc.ea.com"))
            .expect("find EA page");
        let mut page = CefPage::connect(page_target.ws_url.as_deref().unwrap())
            .await
            .expect("connect EA page");
        let probe = page.evaluate(BRIDGE_PROBE_JS).await.expect("evaluate probe");
        assert_eq!(probe.as_str(), Some("ok"));
        let status = read_status(&mut page).await.expect("read Apex status");
        println!(
            "installed={} locale={} installStatus={}",
            status.installed, status.installed_locale, status.install_status
        );
        assert!(status.installed);
    });
}
