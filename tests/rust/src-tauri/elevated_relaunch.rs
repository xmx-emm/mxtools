use super::{relaunch_parent_pid, RELAUNCH_AFTER_FLAG};

#[test]
fn parses_the_parent_pid_after_the_relaunch_flag() {
    assert_eq!(relaunch_parent_pid([RELAUNCH_AFTER_FLAG, "4242"]), Some(4242));
    assert_eq!(
        relaunch_parent_pid(["--autostart", RELAUNCH_AFTER_FLAG, "7"]),
        Some(7)
    );
}

#[test]
fn ignores_missing_or_invalid_parent_pids() {
    assert_eq!(relaunch_parent_pid(Vec::<&str>::new()), None);
    assert_eq!(relaunch_parent_pid([RELAUNCH_AFTER_FLAG]), None);
    assert_eq!(relaunch_parent_pid([RELAUNCH_AFTER_FLAG, "abc"]), None);
    assert_eq!(relaunch_parent_pid([RELAUNCH_AFTER_FLAG, "0"]), None);
}
