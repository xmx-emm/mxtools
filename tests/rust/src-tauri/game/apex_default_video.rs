const SUPPORT: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../tests/fixtures/apex/dxsupport-defaults.cfg"
));

fn machine() -> Hardware {
    Hardware {
        system_memory_mb: 32768,
        video_memory_mb: 8192,
        vendor_id: 0x10de,
        device_id: 0x2684,
        intel_non_uma: false,
        desktop_width: 2560,
        desktop_height: 1440,
        modes: vec![
            DisplayMode {
                width: 1920,
                height: 1080,
                numerator: 60,
                denominator: 1,
            },
            DisplayMode {
                width: 2560,
                height: 1440,
                numerator: 165,
                denominator: 1,
            },
        ],
    }
}

fn values(hw: &Hardware) -> VdfValue {
    parse_vdf_string(&generate(SUPPORT, hw).unwrap()).unwrap()
}

#[test]
fn serializes_all_42_fields_in_game_order_with_hardware_defaults() {
    let text = generate(SUPPORT, &machine()).unwrap();
    assert!(text.starts_with("\"VideoConfig\"\r\n{\r\n"));
    let tree = parse_vdf_string(&text).unwrap();
    let Some(VdfValue::Object(fields)) = tree.get("VideoConfig") else {
        panic!("missing root")
    };
    assert_eq!(fields.len(), 42);
    let fixture = parse_vdf_string(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/fixtures/apex/videoconfig-v10.txt"
    )))
    .unwrap();
    let Some(VdfValue::Object(expected)) = fixture.get("VideoConfig") else {
        panic!("missing fixture root")
    };
    assert_eq!(
        fields.keys().collect::<Vec<_>>(),
        expected.keys().collect::<Vec<_>>()
    );
    for (key, value) in [
        ("configversion", "10"),
        ("new_shadow_settings", "1"),
        ("mat_vsync_mode", "2"),
        ("mat_backbuffer_count", "2"),
        ("mat_antialias_mode", "12"),
        ("stream_memory", "3000000"),
        ("shadow_depth_dimen_min", "256"),
        ("shadow_depth_upres_factor_max", "3"),
        ("sound_volume", "1"),
        ("fadeDistScale", "1"),
        ("defaultres", "2560"),
        ("defaultresheight", "1440"),
        ("ssao_quality", "4"),
        ("csm_enabled", "0"),
        ("csm_coverage", "2"),
        ("csm_cascade_res", "512"),
    ] {
        assert_eq!(
            tree.get_value_by_path(&["VideoConfig", &format!("setting.{key}")]),
            Some(value),
            "{key}"
        );
    }
}

#[test]
fn memory_tiers_use_inclusive_bounds_and_highest_matching_level() {
    for (mb, expected) in [
        (7999, 0),
        (8000, 1),
        (9999, 1),
        (10000, 2),
        (15999, 2),
        (16000, 3),
        (65535, 3),
        (65536, 0),
    ] {
        let hw = Hardware {
            system_memory_mb: mb,
            ..machine()
        };
        assert_eq!(hardware_levels(SUPPORT, &hw).unwrap().0, expected, "{mb}");
    }
}

#[test]
fn texture_budget_uses_both_memory_caps_and_serialized_ladder() {
    for (vram, expected) in [
        (0, 0),
        (1899, 0),
        (1900, 160000),
        (2399, 160000),
        (2400, 600000),
        (3899, 600000),
        (3900, 1000000),
        (5899, 1000000),
        (5900, 2000000),
        (7899, 2000000),
        (7900, 3000000),
        (24576, 3000000),
    ] {
        assert_eq!(texture_budget(vram, 3), expected, "vram={vram}");
    }
    for (level, cap) in [(0, 600000), (1, 1000000), (2, 2000000), (3, 3000000)] {
        assert_eq!(texture_budget(24576, level), cap);
    }
}

#[test]
fn shadow_quality_changes_at_4000_and_8000_mib() {
    for (vram, size, factor) in [
        (3999, "128", "2"),
        (4000, "256", "2"),
        (7999, "256", "2"),
        (8000, "256", "3"),
    ] {
        let tree = values(&Hardware {
            video_memory_mb: vram,
            ..machine()
        });
        assert_eq!(
            tree.get_value_by_path(&["VideoConfig", "setting.shadow_depth_dimen_min"]),
            Some(size)
        );
        assert_eq!(
            tree.get_value_by_path(&["VideoConfig", "setting.shadow_depth_upres_factor_max"]),
            Some(factor)
        );
        assert_eq!(
            tree.get_value_by_path(&["VideoConfig", "setting.shadow_enable"]),
            Some("1")
        );
    }
}

#[test]
fn specific_gpu_overrides_generic_and_intel_discrete_has_startup_override() {
    for (vendor, device, non_uma, expected) in [
        (0x10de, 0x191, false, 0),
        (0x10de, 0x2684, false, 3),
        (0x8086, 1, false, 0),
        (0x8086, 1, true, 3),
        (0xffff, 1, false, 0),
    ] {
        let hw = Hardware {
            vendor_id: vendor,
            device_id: device,
            intel_non_uma: non_uma,
            ..machine()
        };
        assert_eq!(hardware_levels(SUPPORT, &hw).unwrap().1, expected);
        let tree = values(&hw);
        assert_eq!(
            tree.get_value_by_path(&["VideoConfig", "setting.ssao_quality"]),
            Some((expected + 1).to_string().as_str())
        );
        assert_eq!(
            tree.get_value_by_path(&["VideoConfig", "setting.volumetric_lighting"]),
            Some(if expected > 1 { "1" } else { "0" })
        );
    }
}

#[test]
fn dvs_uses_last_eligible_modes_rational_refresh_and_integer_frame_times() {
    for (refresh, denominator, level, expected) in [
        (60, 1, 3, (15834, 16333)),
        (60000, 1001, 3, (15834, 16333)),
        (120, 1, 3, (15834, 16333)),
        (144, 1, 3, (13195, 13611)),
        (165, 1, 3, (11447, 11808)),
        (240, 1, 3, (15834, 16333)),
        (60, 1, 0, (31668, 32667)),
    ] {
        let mut hw = machine();
        hw.modes.last_mut().unwrap().numerator = refresh;
        hw.modes.last_mut().unwrap().denominator = denominator;
        assert_eq!(
            dvs_times(&hw, level).unwrap(),
            expected,
            "{refresh}/{denominator} level={level}"
        );
    }
}

#[test]
fn display_filter_rejects_incompatible_modes_and_coalesces_refresh_variants() {
    let mut hw = machine();
    hw.modes.insert(
        1,
        DisplayMode {
            width: 1920,
            height: 1080,
            numerator: 144,
            denominator: 1,
        },
    );
    hw.modes.push(DisplayMode {
        width: 3840,
        height: 2160,
        numerator: 240,
        denominator: 1,
    });
    hw.modes.push(DisplayMode {
        width: 1280,
        height: 1024,
        numerator: 144,
        denominator: 1,
    });
    hw.modes.push(DisplayMode {
        width: 1024,
        height: 576,
        numerator: 144,
        denominator: 1,
    });
    let filtered = eligible_modes(&hw);
    assert_eq!(filtered.len(), 2);
    assert_eq!(filtered[0].numerator, 144);
    assert_eq!(filtered[1].numerator, 165);
}

#[test]
fn unavailable_inputs_do_not_produce_guessed_defaults() {
    let mut hw = machine();
    assert!(generate("\"invalid\" {}", &hw).is_err());
    hw.modes.clear();
    assert!(generate(SUPPORT, &hw).is_err());
    hw = machine();
    hw.modes.last_mut().unwrap().denominator = 0;
    assert!(generate(SUPPORT, &hw).is_err());
    hw.modes.last_mut().unwrap().denominator = 10;
    assert!(generate(SUPPORT, &hw).is_err());
    hw = machine();
    hw.system_memory_mb = 0;
    assert!(generate(SUPPORT, &hw).is_err());
}
