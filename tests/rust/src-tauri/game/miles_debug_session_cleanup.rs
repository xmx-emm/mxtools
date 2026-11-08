use super::{cef_cleanup_action, CefCleanup, CefSession};

#[test]
fn steam_cleanup_only_undoes_debug_sessions_mxtools_started() {
    assert_eq!(cef_cleanup_action(CefSession::Existing, 0), CefCleanup::None);
    assert_eq!(
        cef_cleanup_action(CefSession::Restarted, 0),
        CefCleanup::RestartNormally
    );
    assert_eq!(cef_cleanup_action(CefSession::Launched, 0), CefCleanup::Shutdown);
}

#[test]
fn steam_cleanup_never_interrupts_a_running_game() {
    assert_eq!(cef_cleanup_action(CefSession::Restarted, 570), CefCleanup::None);
    assert_eq!(cef_cleanup_action(CefSession::Launched, 570), CefCleanup::None);
}
