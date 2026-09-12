#[test]
fn apex_dx12_only_installations_produce_exact_matchers_for_both_platforms() {
    let steam = r"X:\Steam\Apex Legends\r5apex_dx12.exe";
    let ea = r"X:\EA\Apex\r5apex_dx12.exe";
    let files = FixtureFiles::default().file(steam, "").file(ea, "");
    let catalog = catalog_for(GameSource::Steam, Some("1172470"), "Apex Legends");
    let steam_matchers =
        executable_matchers(&files, Path::new(r"X:\Steam\Apex Legends"), None, catalog);
    let ea_matchers = executable_matchers(&files, Path::new(r"X:\EA\Apex"), None, catalog);
    assert_eq!(steam_matchers, vec![executable_matcher(steam)]);
    assert_eq!(ea_matchers, vec![executable_matcher(ea)]);
}

#[cfg(windows)]
#[test]
#[ignore = "read-only installed Apex scan on the local host"]
fn host_apex_scan_lists_current_executables() {
    let roots = ScanRoots::system();
    let report = scan_with(&ScanContext {
        files: &RealFileAccess,
        registry: &RealRegistryAccess,
        roots: &roots,
    });
    let apex = report
        .games
        .iter()
        .find(|game| game.logical_id == "apex-legends")
        .expect("installed Apex");
    println!("Apex matchers: {:?}", apex.matchers);
    assert!(apex.matchers.iter().any(|matcher| matcher
        .value
        .to_ascii_lowercase()
        .contains("steam")
        && matcher.value.ends_with("r5apex_dx12.exe")));
}
