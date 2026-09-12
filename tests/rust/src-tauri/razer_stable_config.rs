#[test]
fn razer_automatic_switching_is_independent_of_beta() {
    let mut config = BackgroundRuntimeConfig::default();
    config.razer.enabled = true;
    config.razer.device_profiles.insert(
        "mouse".into(),
        RazerDevicePollingConfig {
            idle_rate_hz: 500,
            verified_rates_hz: vec![500, 8000],
            ..Default::default()
        },
    );
    config.razer.games.push(RazerGamePollingConfig {
        id: "apex".into(),
        name: "Apex".into(),
        enabled: true,
        matchers: vec![RazerGameMatcher {
            executable: Some(r"D:\Steam\Apex\r5apex_dx12.exe".into()),
            ..Default::default()
        }],
        device_rates_hz: BTreeMap::from([("mouse".into(), 8000)]),
        ..Default::default()
    });
    assert!(!config.beta_features_enabled);
    let native = native_razer_config(&config);
    assert!(native.enabled);
    assert_eq!(native.devices[0].profiles[0].rate_hz, 8000);
    config.razer.enabled = false;
    assert!(!native_razer_config(&config).enabled);
}
