#[test]
fn ea_parses_json_with_spaces_and_rejects_other_offers() {
    assert_eq!(
        parse_progress_payloads(&[
            r#"{ "offerId": "Origin.OFR.50.0002694", "bytesDownloaded": 120, "bytesTotal": 300 }"#
                .into(),
            r#"{ "offerId": "another-game", "bytesDownloaded": 999, "bytesTotal": 1000 }"#.into(),
        ]),
        Some((120, 300))
    );
}

#[test]
fn ea_change_result_checks_inner_json_errors() {
    assert!(bridge_result(Value::String(r#"{"error":"rejected"}"#.into())).is_err());
    assert!(bridge_result(Value::String(r#"{"ok":true}"#.into())).is_ok());
}
