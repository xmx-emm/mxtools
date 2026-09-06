#[test]
fn completion_is_correlated_with_requested_destination() {
    let target = DownloadTarget {
        app_id: 1172470,
        depot: 1172477,
        depot_root: PathBuf::from("C:/Steam/content/app_1172470/depot_1172477"),
    };
    assert!(!completion_for_target(
        "Depot download complete : \"C:/other\"",
        &target
    ));
    assert!(!completion_for_target(
        "Depot download complete : \"C:/Steam/content/app_1172470/depot_11724770\"",
        &target
    ));
    assert!(completion_for_target("Downloading depot 1172477 (2 files, 1 MB) ...\nDepot download complete : \"C:/Steam/content/app_1172470/depot_1172477\"", &target));
    assert!(!completion_for_target(
        "Downloading depot 1172477 (2 files, 1 MB) ...",
        &target
    ));
}

#[test]
fn unknown_transfer_progress_is_explicit() {
    let p = MilesDownloadProgress::new(1, phase::DOWNLOADING);
    assert!(!p.progress_known);
    assert_eq!(p.percent, 0.0);
}
