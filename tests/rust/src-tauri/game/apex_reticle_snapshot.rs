#[test]
fn reticle_snapshot_accepts_supported_values_and_rejects_invalid_values() {
    let values: serde_json::Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/fixtures/apex/reticle-values.json"
    )))
    .unwrap();
    for group in ["accepted", "rejected"] {
        for value in values[group].as_array().unwrap() {
            let value = value.as_str().unwrap();
            assert_eq!(
                validate_value(ConfigFile::Profile, "reticle_color", value).is_ok(),
                group == "accepted",
                "{value:?}"
            );
        }
    }
}

#[test]
fn reticle_snapshot_writes_and_reopens_simplified_value_twice() {
    let root = std::env::temp_dir().join(format!(
        "mxtools-reticle-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir(&root).unwrap();
    let path = root.join("profile.cfg");
    let value = "2147483648 2147483648 2147483648";
    let updates = HashMap::from([("reticle_color".into(), value.into())]);
    let mut doc = ApexCfgDocument::from_content(
        "reticle_color \"210 190 17\"\r\ncl_fovScale \"1.5\"\r\n",
        ApexFileEncoding::Utf8,
    )
    .unwrap();
    apply_profile_updates(&mut doc, &updates).unwrap();
    atomic_write(&path, &encode_doc(&doc)).unwrap();
    verify_updates(ConfigFile::Profile, &path, &updates).unwrap();
    for _ in 0..2 {
        let loaded = load_file_at_path(path.clone()).unwrap();
        let report = report_for(ConfigFile::Profile, &loaded);
        assert_eq!(report.values["reticle_color"], value);
        assert_eq!(report.values["cl_fovScale"], "1.5");
    }
    fs::remove_dir_all(root).unwrap();
}
