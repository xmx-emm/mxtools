mod tests {
    use super::*;

    #[test]
    fn paths_with_spaces_quotes_and_unicode_stay_separate_from_launch_parameters() {
        let path = Path::new(r"C:\游戏\EA's App & Tools\EALauncher.exe");
        let args = launch_arguments(path).unwrap();
        assert_eq!(args.executable.to_string(), path.to_str().unwrap());
        assert_eq!(
            BSTR::try_from(&args.directory).unwrap().to_string(),
            r"C:\游戏\EA's App & Tools"
        );
        assert_eq!(
            BSTR::try_from(&args.arguments).unwrap().to_string(),
            "origin://launchgame/194908"
        );
        assert_eq!(BSTR::try_from(&args.operation).unwrap().to_string(), "open");
        assert_eq!(i32::try_from(&args.show).unwrap(), 7);
    }

    #[test]
    fn relative_launcher_paths_are_rejected_before_contacting_explorer() {
        assert!(launch_arguments(Path::new("EALauncher.exe")).is_err());
        assert!(launch_arguments(Path::new(r"EA\EALauncher.exe")).is_err());
    }

    #[test]
    #[ignore = "Requires an interactive Windows desktop; resolves COM only, never launches a game"]
    fn resolves_existing_explorer_desktop_without_launching_anything() {
        std::thread::spawn(|| {
            let _apartment = ComApartment::initialize().unwrap();
            let _shell = desktop_shell().unwrap();
        })
        .join()
        .unwrap();
    }
}
