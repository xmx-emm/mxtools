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

/// Explicit live acceptance: downloads into Steam's depot cache, never applies
/// audio, deletes files, changes language, or starts/stops a game/client.
#[test]
#[ignore]
fn live_steam_voice_chunk_progress() {
    tauri::async_runtime::block_on(async {
        assert!(!apex_is_running_sync().unwrap());
        reject_running_steam_game(steam_running_app_id()).unwrap();
        let root = get_steam_path_by_registry().expect("Steam path");
        let target = DownloadTarget {
            app_id: 1172470,
            depot: 1172477,
            depot_root: PathBuf::from(root).join("steamapps/content/app_1172470/depot_1172477"),
        };
        let samples = Mutex::new(Vec::new());
        let lost_progress = AtomicBool::new(false);
        let bytes = download_depot_via_cef(
            &target,
            &Arc::new(AtomicBool::new(false)),
            &|done, total| {
                println!("chunk progress: {done}/{total}");
                if total == 0 && !samples.lock().unwrap().is_empty() {
                    lost_progress.store(true, Ordering::Relaxed);
                }
                if total > 0 && done > 0 && done < total {
                    samples.lock().unwrap().push((done, total));
                }
            },
        )
        .await
        .expect("depot completes");
        let samples = samples.into_inner().unwrap();
        assert!(bytes > 0);
        assert!(
            !lost_progress.load(Ordering::Relaxed),
            "progress should not flicker to unknown"
        );
        assert!(
            samples.len() >= 3,
            "need at least three intermediate samples: {samples:?}"
        );
        assert!(samples.windows(2).all(|pair| pair[1].0 >= pair[0].0));
        assert!(samples.last().unwrap().0 > samples.first().unwrap().0);
    });
}
