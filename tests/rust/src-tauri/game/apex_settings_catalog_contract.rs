#[test]
#[ignore = "Vitest supplies the live frontend catalog in a temporary directory; no game access"]
fn complete_settings_catalog_native_bridge() {
    use crate::game::{apex, apex_defaults};

    #[derive(serde::Deserialize)]
    struct Sample {
        id: String,
        file: String,
        key: String,
        value: String,
    }
    let root = PathBuf::from(std::env::var_os("MXTOOLS_APEX_CONTRACT_ROOT").unwrap());
    let samples: Vec<Sample> =
        serde_json::from_slice(&fs::read(root.join("catalog.json")).unwrap()).unwrap();
    assert!(samples.len() > 400, "must validate the full catalog");
    let defaults = apex_defaults::from_inputs(
        include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../tests/fixtures/apex/dxsupport-defaults.cfg"
        )),
        &apex_defaults::video::Hardware {
            system_memory_mb: 32768,
            video_memory_mb: 8192,
            vendor_id: 0x10de,
            device_id: 0x2684,
            intel_non_uma: false,
            desktop_width: 1920,
            desktop_height: 1080,
            modes: vec![apex_defaults::video::DisplayMode {
                width: 1920,
                height: 1080,
                numerator: 144,
                denominator: 1,
            }],
        },
        "english",
    )
    .unwrap();
    let snapshot = snapshot_defaults_from_configs(&defaults).unwrap();
    for sample in samples {
        let label = format!(
            "{}: {}:{}={}",
            sample.id, sample.file, sample.key, sample.value
        );
        if sample.file == "video" {
            apex::validate_video_updates(&HashMap::from([(sample.key.clone(), sample.value)]))
                .expect(&label);
            let value = snapshot.video_config.get(&sample.key).expect(&label);
            apex::validate_video_updates(&HashMap::from([(sample.key, value.clone())]))
                .expect(&label);
        } else {
            let (file, values) = match sample.file.as_str() {
                "settings" => (ConfigFile::Settings, &snapshot.settings),
                "profile" => (ConfigFile::Profile, &snapshot.profile),
                _ => panic!("unknown catalog file: {}", sample.file),
            };
            validate_value(file, &sample.key, &sample.value).expect(&label);
            let value = values.get(&sample.key).expect(&label);
            validate_value(file, &sample.key, value)
                .unwrap_or_else(|error| panic!("reset {label}: {value}: {error:?}"));
        }
    }
}
