use super::{validate_publish_input, PUBLISH_PAYLOAD_MAX_BYTES};
use serde_json::{json, Value};

fn snapshot() -> Value {
    json!({"kind": "apex-config-snapshot", "version": 2, "exportedAt": "", "videoConfig": {"setting.fullscreen": "0"}})
}

#[test]
fn publish_input_trims_and_keeps_valid_text() {
    let (title, description) =
        validate_publish_input("  灵敏度  ".into(), Some("  line1\nline2  ".into()), &snapshot()).unwrap();
    assert_eq!(title, "灵敏度");
    assert_eq!(description.as_deref(), Some("line1\nline2"));
    let (_, empty) = validate_publish_input("t".into(), Some("   ".into()), &snapshot()).unwrap();
    assert_eq!(empty, None);
}

#[test]
fn publish_input_rejects_bad_titles_and_descriptions() {
    assert!(validate_publish_input("   ".into(), None, &snapshot()).is_err());
    assert!(validate_publish_input("a\u{0007}b".into(), None, &snapshot()).is_err());
    assert!(validate_publish_input("a\nb".into(), None, &snapshot()).is_err());
    assert!(validate_publish_input("😀".repeat(41), None, &snapshot()).is_err());
    assert!(validate_publish_input("😀".repeat(40), None, &snapshot()).is_ok());
    assert!(validate_publish_input("t".into(), Some("x".repeat(401)), &snapshot()).is_err());
    assert!(validate_publish_input("t".into(), Some("a\u{0000}".into()), &snapshot()).is_err());
}

#[test]
fn publish_input_rejects_foreign_or_oversized_payloads() {
    assert!(validate_publish_input("t".into(), None, &json!({"kind": "other"})).is_err());
    assert!(validate_publish_input("t".into(), None, &json!([1, 2])).is_err());
    let big = json!({"kind": "apex-config-snapshot", "pad": "x".repeat(PUBLISH_PAYLOAD_MAX_BYTES)});
    assert!(validate_publish_input("t".into(), None, &big).is_err());
}
