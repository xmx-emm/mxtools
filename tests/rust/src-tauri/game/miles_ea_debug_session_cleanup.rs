use super::{ea_cleanup_action, EaCleanup, EaSession};

#[test]
fn ea_cleanup_only_undoes_debug_instances_mxtools_started() {
    assert_eq!(ea_cleanup_action(EaSession::Existing, false), EaCleanup::None);
    assert_eq!(
        ea_cleanup_action(EaSession::Restarted, false),
        EaCleanup::RestartNormally
    );
    assert_eq!(ea_cleanup_action(EaSession::Launched, false), EaCleanup::Close);
}

#[test]
fn ea_cleanup_never_interrupts_another_ea_game() {
    assert_eq!(ea_cleanup_action(EaSession::Restarted, true), EaCleanup::None);
    assert_eq!(ea_cleanup_action(EaSession::Launched, true), EaCleanup::None);
}
