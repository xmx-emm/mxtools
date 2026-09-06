#[test]
fn video_rules_reject_retired_keys_and_cover_the_full_dvs_slider() {
    assert!(validate_video_updates(&HashMap::from([(
        "setting.csm_coverage".into(),
        "0".into()
    ),]))
    .is_err());
    assert!(validate_video_updates(&HashMap::from([
        ("setting.csm_enabled".into(), "0".into()),
        ("setting.csm_coverage".into(), "1".into()),
    ]))
    .is_ok());
    for key in [
        "setting.dvs_supersample_enable",
        "setting.mat_depthfeather_enable",
        "setting.new_shadow_settings",
    ] {
        assert!(validate_video_updates(&HashMap::from([(key.into(), "1".into())])).is_err());
    }
    assert!(validate_video_updates(&HashMap::from([
        ("setting.dvs_gpuframetime_min".into(), "950000".into()),
        ("setting.dvs_gpuframetime_max".into(), "980000".into()),
    ]))
    .is_ok());
    assert!(validate_video_updates(&HashMap::from([(
        "setting.fadeDistScale".into(),
        "0.5".into()
    ),]))
    .is_err());
}
