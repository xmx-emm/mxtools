use super::auth::{server_message, DeviceLoginPoll, OnlineAccount, StoredTokens};
use serde_json::Value;

#[test]
fn stored_tokens_round_trip_through_camel_case_json() {
    let tokens = StoredTokens {
        access_token: "access".into(),
        refresh_token: "refresh".into(),
        access_token_expires_at: "2026-08-13T00:00:00.000Z".into(),
        refresh_token_expires_at: "2026-08-20T00:00:00.000Z".into(),
    };
    let json = serde_json::to_value(&tokens).unwrap();
    assert_eq!(json["accessToken"], "access");
    assert_eq!(json["refreshTokenExpiresAt"], "2026-08-20T00:00:00.000Z");
    let parsed: StoredTokens = serde_json::from_value(json).unwrap();
    assert_eq!(parsed.refresh_token, "refresh");
}

#[test]
fn poll_result_serializes_with_a_status_tag() {
    let pending = serde_json::to_value(DeviceLoginPoll::Pending).unwrap();
    assert_eq!(pending["status"], "pending");
    let approved = serde_json::to_value(DeviceLoginPoll::Approved {
        account: OnlineAccount {
            id: "user-1".into(),
            email: "user@example.com".into(),
            display_name: None,
            role: "USER".into(),
        },
    })
    .unwrap();
    assert_eq!(approved["status"], "approved");
    assert_eq!(approved["account"]["email"], "user@example.com");
}

#[test]
fn server_messages_support_string_and_array_bodies() {
    let text = serde_json::json!({ "message": "too many requests" });
    assert_eq!(server_message(&text).as_deref(), Some("too many requests"));
    let list = serde_json::json!({ "message": ["a", "b"] });
    assert_eq!(server_message(&list).as_deref(), Some("a; b"));
    assert_eq!(server_message(&Value::Null), None);
}
