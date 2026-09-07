struct Fixture(std::path::PathBuf);

#[test]
fn steam_route_has_priority_except_pending_ea_restore() {
    assert!(prefer_steam("japanese", true, false));
    assert!(!prefer_steam("japanese", false, false));
    assert!(!prefer_steam("japanese", true, true));
    assert!(!prefer_steam("unknown-language", true, false));
}
impl Fixture {
    fn new() -> Self {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("mxtools-ea-voice-{}-{nonce}", std::process::id()));
        std::fs::create_dir_all(root.join("steam")).unwrap();
        std::fs::create_dir_all(root.join("ea")).unwrap();
        Self(root)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn copies_only_requested_voice_pair_to_ea() {
    let fixture = Fixture::new();
    let source = fixture.0.join("steam");
    let destination = fixture.0.join("ea");
    for name in ["general_japanese.mstr", "general_japanese_patch_1.mstr"] {
        std::fs::write(source.join(name), b"new audio").unwrap();
        std::fs::write(destination.join(name), b"old audio").unwrap();
    }
    std::fs::write(source.join("other-file.txt"), b"leave in source").unwrap();
    std::fs::write(
        destination.join("general_english.mstr"),
        b"original English",
    )
    .unwrap();
    copy_voice_files(&source, &destination, "japanese").unwrap();
    assert_eq!(
        std::fs::read(destination.join("general_japanese.mstr")).unwrap(),
        b"new audio"
    );
    assert_eq!(
        std::fs::read(destination.join("general_japanese_patch_1.mstr")).unwrap(),
        b"new audio"
    );
    assert_eq!(
        std::fs::read(destination.join("general_english.mstr")).unwrap(),
        b"original English"
    );
    assert!(!destination.join("other-file.txt").exists());
    assert_eq!(std::fs::read_dir(&destination).unwrap().count(), 3);
}

#[test]
fn incomplete_source_does_not_replace_existing_voice() {
    let fixture = Fixture::new();
    let source = fixture.0.join("steam");
    let destination = fixture.0.join("ea");
    std::fs::write(source.join("general_japanese.mstr"), b"new audio").unwrap();
    std::fs::write(destination.join("general_japanese.mstr"), b"old audio").unwrap();
    assert!(copy_voice_files(&source, &destination, "japanese").is_err());
    std::fs::write(source.join("general_japanese_patch_1.mstr"), b"").unwrap();
    assert!(copy_voice_files(&source, &destination, "japanese").is_err());
    assert_eq!(
        std::fs::read(destination.join("general_japanese.mstr")).unwrap(),
        b"old audio"
    );
    assert!(copy_voice_files(&source, &destination, "../japanese").is_err());
    assert!(copy_voice_files(&source, &fixture.0.join("missing"), "japanese").is_err());
}

#[test]
fn locked_second_file_rolls_back_first_file() {
    use std::os::windows::fs::OpenOptionsExt;
    let fixture = Fixture::new();
    let source = fixture.0.join("steam");
    let destination = fixture.0.join("ea");
    for name in ["general_japanese.mstr", "general_japanese_patch_1.mstr"] {
        std::fs::write(source.join(name), b"new").unwrap();
        std::fs::write(destination.join(name), b"original").unwrap();
    }
    let locked = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(destination.join("general_japanese_patch_1.mstr"))
        .unwrap();
    assert!(copy_voice_files(&source, &destination, "japanese").is_err());
    drop(locked);
    for name in ["general_japanese.mstr", "general_japanese_patch_1.mstr"] {
        assert_eq!(std::fs::read(destination.join(name)).unwrap(), b"original");
    }
    assert_eq!(std::fs::read_dir(destination).unwrap().count(), 2);
}
