#[test]
fn discovers_uncatalogued_game_and_nested_binary_without_install_helpers() {
    let files = FixtureFiles::default()
        .directory(r"X:\Game")
        .directory(r"X:\Game\Binaries")
        .directory(r"X:\Game\Binaries\Win64")
        .directory(r"X:\Game\_CommonRedist")
        .file(r"X:\Game\Game.exe", "")
        .file(r"X:\Game\unins000.exe", "")
        .file(r"X:\Game\Binaries\Win64\Game-Win64-Shipping.exe", "")
        .file(r"X:\Game\Binaries\Win64\CrashReportClient.exe", "")
        .file(r"X:\Game\_CommonRedist\helper.exe", "");
    let matches = executable_matchers(&files, Path::new(r"X:\Game"), None, None);
    assert_eq!(matches.len(), 2);
    assert!(matches.iter().any(|item| item.value.ends_with("Game.exe")));
    assert!(matches
        .iter()
        .any(|item| item.value.ends_with("Game-Win64-Shipping.exe")));
}

#[test]
fn declared_executable_remains_authoritative() {
    let files = FixtureFiles::default()
        .directory(r"X:\Game")
        .file(r"X:\Game\actual.exe", "")
        .file(r"X:\Game\other.exe", "");
    let matches = executable_matchers(&files, Path::new(r"X:\Game"), Some("actual.exe"), None);
    assert_eq!(matches, vec![executable_matcher(r"X:\Game\actual.exe")]);
}

#[cfg(windows)]
#[test]
#[ignore = "read-only local other-game discovery"]
fn host_other_games_have_executable_candidates() {
    let roots = ScanRoots::system();
    let report = scan_with(&ScanContext {
        files: &RealFileAccess,
        registry: &RealRegistryAccess,
        roots: &roots,
    });
    let others: Vec<_> = report
        .games
        .iter()
        .filter(|game| !game.is_shooter)
        .collect();
    for game in &others {
        println!(
            "{}: {} executable/package matchers",
            game.name,
            game.matchers.len()
        );
    }
    assert!(others.iter().any(|game| !game.matchers.is_empty()));
}
