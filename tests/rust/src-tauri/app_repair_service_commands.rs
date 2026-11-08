use super::super::enable_service_registry_command;

#[test]
fn disabled_services_are_reenabled_through_the_registry_start_value() {
    assert_eq!(
        enable_service_registry_command("AppXSvc"),
        r#"reg.exe add "HKLM\SYSTEM\CurrentControlSet\Services\AppXSvc" /v Start /t REG_DWORD /d 3 /f"#
    );
    assert!(!enable_service_registry_command("ClipSVC").contains("sc.exe"));
}
