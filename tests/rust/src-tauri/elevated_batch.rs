use super::{build_status_batch, parse_status_file, resolve_action_results, ActionCommands};
use std::collections::HashMap;
use std::path::Path;

fn group(action: &str, commands: &[&str]) -> ActionCommands {
    ActionCommands {
        action: action.to_string(),
        commands: commands.iter().map(|command| command.to_string()).collect(),
    }
}

#[test]
fn batch_isolates_each_action_and_records_its_status() {
    let groups = [
        group("first", &["a.exe", "b.exe"]),
        group("empty", &[]),
        group("second", &["c.exe"]),
    ];
    let batch = build_status_batch(&groups, Path::new("T:/x.status"));
    assert_eq!(
        batch,
        concat!(
            r#"((a.exe && b.exe) && (>>"T:/x.status" echo first=ok) || (>>"T:/x.status" echo first=fail))"#,
            " & ",
            r#"((c.exe) && (>>"T:/x.status" echo second=ok) || (>>"T:/x.status" echo second=fail))"#,
        )
    );
}

#[test]
fn status_file_parsing_prefers_failure_and_ignores_noise() {
    let parsed =
        parse_status_file("first=ok\r\nsecond=fail\r\nnoise\r\nsecond=ok\r\nthird=maybe\r\n");
    assert_eq!(parsed.get("first"), Some(&true));
    assert_eq!(parsed.get("second"), Some(&false));
    assert!(!parsed.contains_key("third"));
}

#[test]
fn results_use_per_action_status_then_fall_back_to_batch_result() {
    let groups = [
        group("first", &["a.exe"]),
        group("second", &["b.exe"]),
        group("missing", &["c.exe"]),
        group("noop", &[]),
    ];
    let statuses = HashMap::from([("first".to_string(), true), ("second".to_string(), false)]);
    let results = resolve_action_results(&groups, true, Some(&statuses));
    assert!(results["first"].is_ok());
    assert!(results["second"].is_err());
    assert!(results["missing"].is_err());
    assert!(results["noop"].is_ok());

    let unreadable = resolve_action_results(&groups, true, None);
    assert!(unreadable.values().all(Result::is_ok));
    let denied = resolve_action_results(&groups, false, Some(&HashMap::new()));
    assert!(denied["first"].is_err());
    assert!(denied["noop"].is_ok());
}
