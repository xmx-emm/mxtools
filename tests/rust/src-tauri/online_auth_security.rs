#[test]
fn verification_urls_must_share_the_configured_origin() {
    let base = "https://apex.0w0.online/api/v1";
    let valid = "https://apex.0w0.online/device?code=ABCD".to_string();
    assert_eq!(
        super::validate_verification_url(base, valid.clone()).unwrap(),
        valid
    );

    for invalid in [
        "http://apex.0w0.online/device?code=ABCD",
        "https://evil.example/device?code=ABCD",
        "https://apex.0w0.online.evil.example/device?code=ABCD",
        "https://user@apex.0w0.online/device?code=ABCD",
    ] {
        assert!(super::validate_verification_url(base, invalid.to_string()).is_err());
    }
    assert!(super::validate_verification_url(
        "http://apex.0w0.online/api/v1",
        "http://apex.0w0.online/device?code=ABCD".to_string(),
    )
    .is_err());
}

#[test]
#[cfg(debug_assertions)]
fn debug_api_override_accepts_only_loopback_urls() {
    assert_eq!(
        super::super::normalize_api_base_override(" http://127.0.0.1:3000/api/v1/ "),
        Some("http://127.0.0.1:3000/api/v1".to_string())
    );
    assert!(super::super::normalize_api_base_override("http://[::1]:3000/api/v1").is_some());
    assert!(super::super::normalize_api_base_override("https://localhost/api/v1").is_some());

    for invalid in [
        "https://example.com/api/v1",
        "http://localhost.evil.example/api/v1",
        "file:///tmp/api",
        "http://user@localhost:3000/api/v1",
        "http://localhost:3000/api/v1?target=other",
    ] {
        assert!(super::super::normalize_api_base_override(invalid).is_none());
    }
}

#[test]
fn pending_authorization_requires_an_active_unexpired_login() {
    let now = std::time::Instant::now();
    let url = "https://apex.0w0.online/device?code=ABCD";
    let pending = super::PendingDeviceLogin {
        device_code: "private-device-code".into(),
        deadline: now + std::time::Duration::from_secs(60),
        verification_uri_complete: super::validate_verification_url(
            "https://apex.0w0.online/api/v1",
            url.into(),
        )
        .unwrap(),
    };
    assert_eq!(
        super::pending_verification_url(Some(&pending), now).unwrap(),
        url
    );
    assert!(super::pending_verification_url(None, now).is_err());
    assert!(super::pending_verification_url(Some(&pending), pending.deadline).is_err());
}

#[test]
fn local_authorization_url_requires_the_configured_origin_and_port() {
    let base = "http://127.0.0.1:3000/api/v1";
    let url = "http://127.0.0.1:3000/device?code=ABCD";
    assert_eq!(
        super::validate_verification_url(base, url.into()).unwrap(),
        url
    );
    for invalid in [
        "http://127.0.0.1:3001/device",
        "http://localhost:3000/device",
        "https://evil.example/device",
        "file:///C:/Windows/notepad.exe",
        "javascript:alert(1)",
    ] {
        assert!(super::validate_verification_url(base, invalid.into()).is_err());
    }
}
