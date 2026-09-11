struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let mut nonce = [0u8; 8];
        getrandom::fill(&mut nonce).unwrap();
        let root =
            std::env::temp_dir().join(format!("mxtools-portable-test-{}", hex::encode(nonce)));
        fs::create_dir(&root).unwrap();
        Self(root)
    }
    fn staged(&self) -> (PathBuf, Plan) {
        let target = self.0.join("自定义 名字.exe");
        fs::write(&target, b"old portable").unwrap();
        let staging = self.0.join(".mxtools-update-test");
        fs::create_dir(&staging).unwrap();
        fs::write(staging.join("update.exe"), b"new portable").unwrap();
        let plan = Plan {
            original_hash: hash(&target).unwrap(),
            launcher: target,
            launcher_pid: 0,
            app_pid: 0,
            signature: String::new(),
        };
        (staging, plan)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        // This fixture owns the exact fresh temporary directory, never a user path.
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn replaces_original_named_executable_and_cleans_own_files() {
    let fixture = Fixture::new();
    let (staging, plan) = fixture.staged();
    replace_and_restart(&staging, &plan, |path| {
        assert_eq!(path, plan.launcher);
        assert_eq!(fs::read(path).unwrap(), b"new portable");
        Ok(())
    })
    .unwrap();
    assert_eq!(fs::read(&plan.launcher).unwrap(), b"new portable");
    assert!(!staging.exists());
}

#[test]
fn preserves_original_on_missing_payload_changed_target_and_restart_failure() {
    for failure in ["missing", "changed", "restart"] {
        let fixture = Fixture::new();
        let (staging, plan) = fixture.staged();
        if failure == "missing" {
            fs::remove_file(staging.join("update.exe")).unwrap();
        }
        if failure == "changed" {
            fs::write(&plan.launcher, b"user changed file").unwrap();
        }
        assert!(replace_and_restart(&staging, &plan, |_| Err("restart failed".into())).is_err());
        assert_eq!(
            fs::read(&plan.launcher).unwrap(),
            if failure == "changed" {
                b"user changed file".as_slice()
            } else {
                b"old portable".as_slice()
            }
        );
    }
}

#[test]
fn verifies_staged_signature_again_and_rejects_tampering() {
    let payload = include_bytes!("../../fixtures/updater/payload.txt");
    let signature = include_str!("../../fixtures/updater/payload.txt.sig");
    let key = include_str!("../../fixtures/updater/test.pub");
    verify(payload, signature, key).unwrap();
    assert!(verify(b"corrupt", signature, key).is_err());
    assert!(verify(payload, "invalid", key).is_err());
}

#[cfg(windows)]
#[test]
fn portable_autostart_uses_quoted_original_paths_and_parses_legacy_cache_entries() {
    assert_eq!(
        quoted_launcher_path(Path::new(r"\\?\C:\My Tools\自定义.exe")),
        r#""C:\My Tools\自定义.exe""#
    );
    assert_eq!(
        quoted_launcher_path(Path::new(r"\\?\UNC\server\share\app.exe")),
        r#""\\server\share\app.exe""#
    );
    for command in [
        r#""C:\My Tools\mxtools-portable.exe" --autostart"#,
        r"C:\My Tools\mxtools-portable.exe --autostart",
    ] {
        assert_eq!(
            cached_autostart_target(command),
            Some(Path::new(r"C:\My Tools\mxtools-portable.exe"))
        );
    }
    assert!(cached_autostart_target(r"C:\app.exe --something-else").is_none());
}

#[cfg(windows)]
#[test]
fn rejects_a_process_that_does_not_match_the_launcher() {
    let fixture = Fixture::new();
    let (staging, plan) = fixture.staged();
    assert!(Process::open(std::process::id(), &plan.launcher).is_err());
    assert!(Process::open(std::process::id(), &std::env::current_exe().unwrap()).is_ok());
    clean_staging(&staging);
}

#[cfg(windows)]
#[test]
#[ignore = "Requires the isolated signed NSIS fixtures created by scripts/test-portable-update.ps1"]
fn signed_sfx_update_roundtrip() {
    let artifacts =
        PathBuf::from(std::env::var_os("MXTOOLS_PORTABLE_TEST_DIR").expect("fixture directory"));
    let fixture = Fixture::new();
    let target = fixture.0.join("萌新 自定义.exe");
    fs::copy(artifacts.join("old.exe"), &target).unwrap();
    let original_hash = hash(&target).unwrap();
    let report = fixture.0.join("old-report.txt");
    let stop = fixture.0.join("stop");
    let mut launcher = Command::new(&target)
        .env("MXTOOLS_PORTABLE_FIXTURE_REPORT", &report)
        .env("MXTOOLS_PORTABLE_FIXTURE_STOP", &stop)
        .spawn()
        .unwrap();
    let read_report = |path: &Path| -> Vec<String> {
        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            let lines: Vec<String> = fs::read_to_string(path)
                .unwrap_or_default()
                .lines()
                .map(str::to_owned)
                .collect();
            if lines.len() == 5 {
                return lines;
            }
            assert!(
                Instant::now() < deadline,
                "Missing fixture report: {}",
                path.display()
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    };
    let old = read_report(&report);
    assert_eq!(old[4], "old");
    assert_eq!(
        Path::new(&old[2]).canonicalize().unwrap(),
        target.canonicalize().unwrap()
    );
    assert_eq!(old[3].parse::<u32>().unwrap(), launcher.id());
    let staging = fixture.0.join(".mxtools-update-roundtrip");
    fs::create_dir(&staging).unwrap();
    fs::copy(artifacts.join("new.exe"), staging.join("update.exe")).unwrap();
    let plan = Plan {
        launcher: target.clone(),
        app_pid: old[0].parse().unwrap(),
        launcher_pid: launcher.id(),
        original_hash: original_hash.clone(),
        signature: fs::read_to_string(artifacts.join("new.exe.sig")).unwrap(),
    };
    let plan_path = staging.join("plan.json");
    fs::write(&plan_path, serde_json::to_vec(&plan).unwrap()).unwrap();
    let key = fs::read_to_string(artifacts.join("test.key.pub")).unwrap();
    let payload = PathBuf::from(&old[1]);
    let worker = std::thread::spawn(move || run_verified_helper(&plan_path, &payload, &key));
    let deadline = Instant::now() + Duration::from_secs(15);
    while !staging.join("ready").exists() {
        assert!(!worker.is_finished(), "Helper exited before handshake");
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(hash(&target).unwrap(), original_hash);
    assert!(launcher.try_wait().unwrap().is_none());
    fs::write(stop, b"stop").unwrap();
    worker.join().unwrap().unwrap();
    assert!(launcher.wait().unwrap().success());
    assert_eq!(
        hash(&target).unwrap(),
        hash(&artifacts.join("new.exe")).unwrap()
    );
    assert!(!staging.exists());
    let restarted = read_report(&PathBuf::from(
        std::env::var_os("MXTOOLS_PORTABLE_FIXTURE_REPORT").unwrap(),
    ));
    assert_eq!(restarted[4], "new");
    // Starting the SAME original user filename again must run the new payload.
    let again = fixture.0.join("again.txt");
    assert!(Command::new(&target)
        .env("MXTOOLS_PORTABLE_FIXTURE_REPORT", &again)
        .status()
        .unwrap()
        .success());
    assert_eq!(read_report(&again)[4], "new");
}
