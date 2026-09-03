#[test]
fn parse_start_line_reads_total_mb() {
    let spew =
        "download_depot 1172470 1172477\nDownloading depot 1172477 (2 files, 3619 MB) ... \n";
    let total = parse_start_line(spew, 1172477).unwrap().unwrap();
    assert_eq!(total, (3619.0 * 1024.0 * 1024.0) as u64);
}

#[test]
fn parse_start_line_detects_rejections() {
    for bad in [
        "Depot download failed : ...",
        "Access Denied (403)",
        "App 1172470 is not available from this account.",
        "Not logged on.",
    ] {
        assert!(
            parse_start_line(bad, 1172477).is_err(),
            "should identify failed line: {bad}"
        );
    }
    assert!(parse_start_line("unrelated output", 1172477)
        .unwrap()
        .is_none());
}

#[test]
fn complete_line_detected() {
    assert!(is_complete_line(
        "Downloading depot 1 (1 files, 1 MB) ...\nDepot download complete : \"C:\\\\x\" (manifest 1)\n"
    ));
    assert!(!is_complete_line("Downloading depot 1 (1 files, 1 MB) ..."));
}

#[test]
fn download_gate_allows_only_one_launcher_download() {
    release_download_gate();

    assert!(try_acquire_download_gate().unwrap());
    assert!(!try_acquire_download_gate().unwrap());

    release_download_gate();
    assert!(try_acquire_download_gate().unwrap());
    release_download_gate();
}

#[test]
fn running_game_is_rejected_before_cef_reuse() {
    assert!(reject_running_steam_game(0).is_ok());
    assert_eq!(
        reject_running_steam_game(1172470).unwrap_err(),
        "apex.milesDl.gameRunning"
    );
}

/// Live download test with a small free depot. Requires a signed-in Steam client
/// already running with `-cef-enable-debugging`.
/// Manual command: `cargo test --lib live_tiny_depot_download -- --ignored --nocapture`.
#[test]
#[ignore]
fn live_tiny_depot_download() {
    tauri::async_runtime::block_on(async {
        let steam = get_steam_path_by_registry().expect("Steam path");
        let depot_root = PathBuf::from(steam)
            .join("steamapps")
            .join("content")
            .join("app_1007")
            .join("depot_1006");
        let _ = std::fs::remove_dir_all(&depot_root);
        let target = DownloadTarget {
            app_id: 1007,
            depot: 1006,
            depot_root: depot_root.clone(),
        };
        let cancel = Arc::new(AtomicBool::new(false));
        let total = download_depot_via_cef(&target, &cancel, &|downloaded, total| {
            println!("progress: {downloaded}/{total}");
        })
        .await
        .expect("download succeeds");
        assert!(total > 0);
        assert!(dir_size(&depot_root) > 0);
        let _ = std::fs::remove_dir_all(&depot_root);
    });
}
