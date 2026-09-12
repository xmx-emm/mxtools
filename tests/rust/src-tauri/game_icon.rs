#[test]
fn missing_or_remote_executables_have_no_local_icon() {
    assert!(extract_icon(r"\\server\games\apex.exe").is_none());
    assert!(extract_icon("//server/games/apex.exe").is_none());
    assert!(extract_icon("relative.exe").is_none());
    assert!(extract_icon("https://example.com/game.exe").is_none());
}

#[cfg(windows)]
#[test]
fn only_plain_drive_absolute_paths_pass_the_syntax_gate() {
    use std::path::Path;

    assert_eq!(local_drive_root(Path::new(r"C:\Games\apex.exe")), Some(Path::new(r"C:\").to_path_buf()));
    for path in [
        r"\\server\games\apex.exe",
        "//server/games/apex.exe",
        r"\\?\C:\Games\apex.exe",
        r"\\.\C:\Games\apex.exe",
        r"C:Games\apex.exe",
        r"C:\Games\..\apex.exe",
    ] {
        assert!(local_drive_root(Path::new(path)).is_none(), "{path}");
    }
}

#[cfg(windows)]
#[test]
fn canonical_drive_path_is_converted_for_shell_icon_lookup() {
    use std::path::Path;

    assert_eq!(
        plain_resolved_drive_path(Path::new(r"\\?\C:\Games\apex.exe")),
        Some(Path::new(r"C:\Games\apex.exe").to_path_buf())
    );
    assert!(plain_resolved_drive_path(Path::new(r"\\?\UNC\server\share\apex.exe")).is_none());
}

#[cfg(windows)]
#[test]
fn test_executable_icon_is_a_decodable_png() {
    use base64::Engine;
    let executable = std::env::current_exe().unwrap();
    let result = extract_icon(executable.to_str().unwrap()).expect("test executable icon");
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(result.strip_prefix("data:image/png;base64,").unwrap())
        .unwrap();
    let image = image::load_from_memory(&bytes).expect("valid PNG");
    assert_eq!((image.width(), image.height()), (32, 32));
    assert!(image.to_rgba8().pixels().any(|pixel| pixel[3] != 0));
}

#[cfg(windows)]
#[test]
#[ignore = "read-only icon extraction from installed Apex"]
fn host_apex_icon_is_a_decodable_png() {
    use base64::Engine;
    let result = extract_icon(r"D:\SteamLibrary\steamapps\common\Apex Legends\r5apex_dx12.exe")
        .expect("local Apex icon");
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(result.strip_prefix("data:image/png;base64,").unwrap())
        .unwrap();
    let image = image::load_from_memory(&bytes).expect("valid PNG");
    assert_eq!((image.width(), image.height()), (32, 32));
    assert!(image.to_rgba8().pixels().any(|pixel| pixel[3] != 0));
}
