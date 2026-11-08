use super::*;

#[test]
fn avatar_url_accepts_only_plain_http_urls() {
    assert_eq!(
        normalize_avatar_url(Some(" https://cdn.example.com/a.png ")).as_deref(),
        Some("https://cdn.example.com/a.png")
    );
    assert!(normalize_avatar_url(Some("http://cdn.example.com/a.png")).is_some());
    for rejected in [
        "",
        "/relative/a.png",
        "file:///C:/Users/me/a.png",
        "data:image/png;base64,AAAA",
        "javascript:alert(1)",
        "https://user:pass@cdn.example.com/a.png",
    ] {
        assert_eq!(normalize_avatar_url(Some(rejected)), None, "{rejected}");
    }
    assert_eq!(normalize_avatar_url(None), None);
}

#[test]
fn avatar_content_type_is_whitelisted_and_rejects_svg() {
    assert_eq!(allowed_image_type(Some("image/png")), Some("image/png"));
    assert_eq!(
        allowed_image_type(Some("IMAGE/JPEG; charset=binary")),
        Some("image/jpeg")
    );
    assert_eq!(allowed_image_type(Some("image/svg+xml")), None);
    assert_eq!(allowed_image_type(Some("text/html")), None);
    assert_eq!(allowed_image_type(None), None);
}

#[test]
fn avatar_data_url_is_base64_encoded() {
    assert_eq!(
        to_data_url("image/png", b"abc"),
        "data:image/png;base64,YWJj"
    );
}

#[test]
fn avatar_url_rejects_local_and_private_hosts() {
    for rejected in [
        "http://localhost/a.png",
        "http://app.localhost/a.png",
        "http://127.0.0.1/a.png",
        "http://10.0.0.5/a.png",
        "http://172.16.0.1/a.png",
        "http://192.168.1.1/a.png",
        "http://169.254.169.254/latest/meta-data",
        "http://100.64.0.1/a.png",
        "http://0.0.0.0/a.png",
        "http://[::1]/a.png",
        "http://[fd00::1]/a.png",
        "http://[fe80::1]/a.png",
        "http://[::ffff:127.0.0.1]/a.png",
    ] {
        assert_eq!(normalize_avatar_url(Some(rejected)), None, "{rejected}");
    }
    assert!(normalize_avatar_url(Some("https://93.184.216.34/a.png")).is_some());
}
