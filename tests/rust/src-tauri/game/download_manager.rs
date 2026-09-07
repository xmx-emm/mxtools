fn job(id: u64, platform: &str, status: &str) -> DownloadJob {
    DownloadJob {
        id,
        platform: platform.into(),
        language: "japanese".into(),
        ea_user_id: None,
        depot: 1172477,
        status: status.into(),
        requested: None,
        created_at: now(),
        updated_at: now(),
        progress: steam::MilesDownloadProgress::new(1172477, status),
    }
}

#[test]
fn queue_is_serial_and_retains_paused_jobs() {
    let mut manager = Manager::default();
    manager.snapshot.jobs = vec![
        job(1, "steam", "paused"),
        job(2, "ea", "queued"),
        job(3, "steam", "queued"),
    ];
    assert_eq!(manager.next().unwrap().id, 2);
    assert!(manager.next().is_none());
    assert!(!manager.update("steam", &steam::MilesDownloadProgress::new(1172477, "done")));
    assert_eq!(manager.active, Some(2));
    assert!(manager.update("ea", &steam::MilesDownloadProgress::new(0, "done")));
    assert_eq!(manager.next().unwrap().id, 3);
    assert_eq!(manager.snapshot.jobs[0].status, "paused");
}

#[test]
fn pause_waits_for_worker_acknowledgement_even_if_client_shutdown_is_an_error() {
    let mut manager = Manager::default();
    manager.snapshot.jobs = vec![job(1, "steam", "queued")];
    manager.next();
    manager.snapshot.jobs[0].requested = Some("pause".into());
    manager.update(
        "steam",
        &steam::MilesDownloadProgress::new(1172477, "downloading"),
    );
    assert_eq!(manager.snapshot.jobs[0].status, "stopping");
    assert_eq!(manager.active, Some(1));
    manager.update(
        "steam",
        &steam::MilesDownloadProgress::new(1172477, "error"),
    );
    assert_eq!(manager.snapshot.jobs[0].status, "paused");
    assert_eq!(manager.active, None);
}

#[test]
fn stale_other_depot_cannot_complete_current_task() {
    let mut manager = Manager::default();
    manager.snapshot.jobs = vec![job(1, "steam", "queued")];
    manager.next();
    assert!(!manager.update("steam", &steam::MilesDownloadProgress::new(12, "done")));
    assert_eq!(manager.snapshot.jobs[0].status, "checking");
}
