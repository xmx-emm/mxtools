#[test]
fn accepts_only_our_https_release_assets() {
    for url in [
        "http://github.com/xmx-emm/mxtools/releases/download/v1/app.exe",
        "https://github.com/other/app/releases/download/v1/app.exe",
        "https://example.com/app.exe",
    ] {
        assert!(!valid_update_url(&url.parse().unwrap()));
    }
    assert!(valid_update_url(
        &"https://github.com/xmx-emm/mxtools/releases/download/v1/app.exe"
            .parse()
            .unwrap()
    ));
}
