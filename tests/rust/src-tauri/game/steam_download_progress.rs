fn sources(done: u64, outstanding: u64) -> String {
    format!("Download sources:\nDownload jobs:\nIteration 1, chunks: index 24, {outstanding} outstanding (456.62 KB), 0 deferred, 100 requested, {done} succeeded, 0 failed. 1.0 Mbps\n\t- type SteamCache, name host chunks: {outstanding} outstanding, 100 requested, {done} succeeded, 0 failed.\n")
}

#[test]
fn source_summaries_do_not_double_count_details() {
    assert_eq!(
        parse_sources(&sources(379, 2)),
        Some(SourceProgress {
            completed: 379,
            busy: true
        })
    );
    assert_eq!(
        parse_sources("Download sources:\nDownload jobs:\n"),
        Some(SourceProgress {
            completed: 0,
            busy: false
        })
    );
    assert_eq!(parse_sources("unrelated console reply"), None);
    assert_eq!(
        parse_sources("Download jobs:\nIteration 1, changed format"),
        None
    );
    assert_eq!(
        parse_sources(
            "Download jobs:\nIteration 1, chunks: 0 outstanding, 0 deferred, 1 succeeded"
        ),
        None
    );
}

#[test]
fn measured_live_sequence_has_intermediate_progress() {
    let mut p = ChunkProgress::new(1172470, 1172475, true);
    p.observe_log("[2026-09-07 07:55:56] AppID 1172470 update started : download 0/4259082592\n[2026-09-07 07:55:56] Downloading 4541 chunks for depot 1172475 (1536936524379201334)\n");
    for n in [0, 379, 855, 1296, 1759, 2224, 2729, 3308, 3852, 4393, 4541] {
        assert_eq!(p.sample(parse_sources(&sources(n, 0))), Some((n, 4541)));
        assert_eq!(p.sample(None), Some((n, 4541)));
    }
    assert_eq!(p.sample(None), Some((4541, 4541)));
    assert_eq!(p.sample(None), Some((4541, 4541)));
    assert_eq!(p.sample(None), None);
    assert_eq!(
        p.sample(parse_sources(&sources(4541, 0))),
        Some((4541, 4541))
    );
    p.observe_log("Downloading 12 chunks for depot 578081 (1)");
    assert_eq!(p.sample(None), None);
}

#[test]
fn foreign_downloads_and_unknown_totals_are_not_percentages() {
    let mut p = ChunkProgress::new(1172470, 1172475, true);
    assert_eq!(p.sample(parse_sources(&sources(10, 0))), None);
    p.observe_log("Downloading 4541 chunks for depot 11724750 (1)");
    p.observe_log("Downloading 4541 chunks for depot 1172475 (1)");
    assert_eq!(p.sample(parse_sources(&sources(10, 0))), None);
    let mut p = ChunkProgress::new(1172470, 1172475, false);
    p.observe_log("Downloading 4541 chunks for depot 1172475 (1)");
    assert_eq!(p.sample(parse_sources(&sources(10, 0))), None);
}

#[test]
fn overlap_reset_and_excess_counts_invalidate_measurement() {
    for line in [
        "Downloading 12 chunks for depot 578081 (1)",
        "AppID 578080 update started : download 0/12",
        "AppID 1172470 update started : download 0/12",
    ] {
        let mut p = ChunkProgress::new(1172470, 1172475, true);
        p.observe_log("Downloading 4541 chunks for depot 1172475 (1)");
        p.observe_log(line);
        assert_eq!(p.sample(parse_sources(&sources(10, 0))), None);
    }
    for bad in [9, 4542] {
        let mut p = ChunkProgress::new(1172470, 1172475, true);
        p.observe_log("Downloading 4541 chunks for depot 1172475 (1)");
        assert_eq!(p.sample(parse_sources(&sources(10, 0))), Some((10, 4541)));
        assert_eq!(p.sample(parse_sources(&sources(bad, 0))), None);
        assert_eq!(p.sample(parse_sources(&sources(20, 0))), None);
    }
}

#[test]
fn log_reader_ignores_history_and_buffers_partial_lines() {
    use std::io::Write;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "mxtools-content-log-{}-{nonce}.txt",
        std::process::id()
    ));
    std::fs::write(&path, "old download\n").unwrap();
    let mut reader = ContentLog::open(&path).unwrap();
    assert_eq!(reader.poll().unwrap(), "");
    let mut writer = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .unwrap();
    writer.write_all(b"Downloading 4541 chunks").unwrap();
    assert_eq!(reader.poll().unwrap(), "");
    writer.write_all(b" for depot 1172475 (1)\nnext").unwrap();
    assert_eq!(
        reader.poll().unwrap(),
        "Downloading 4541 chunks for depot 1172475 (1)\n"
    );
    drop(writer);
    std::fs::write(&path, "").unwrap();
    assert!(reader.poll().is_err());
    drop(reader);
    std::fs::remove_file(path).unwrap();
}
