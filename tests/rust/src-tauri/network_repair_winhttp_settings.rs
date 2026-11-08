use super::winhttp_settings_is_direct;

fn settings(flags: u32) -> Vec<u8> {
    let mut bytes = vec![0x28, 0, 0, 0, 0, 0, 0, 0];
    bytes.extend_from_slice(&flags.to_le_bytes());
    bytes.extend_from_slice(&[0; 8]);
    bytes
}

#[test]
fn direct_flag_alone_means_no_winhttp_proxy() {
    assert_eq!(winhttp_settings_is_direct(&settings(0x01)), Some(true));
    assert_eq!(winhttp_settings_is_direct(&settings(0x00)), Some(true));
}

#[test]
fn manual_pac_or_autodetect_flags_mean_configured() {
    for flags in [0x03, 0x05, 0x09] {
        assert_eq!(winhttp_settings_is_direct(&settings(flags)), Some(false));
    }
}

#[test]
fn truncated_settings_fall_back_to_netsh() {
    assert_eq!(winhttp_settings_is_direct(&[0x28, 0, 0, 0, 0, 0, 0, 0, 1]), None);
}
