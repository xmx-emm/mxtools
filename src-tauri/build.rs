fn main() {
    let mut attributes = tauri_build::Attributes::new();
    // Library tests need Common Controls v6 for native dialogs on Windows 10.
    // Let the linker own the debug manifest for every target; embedding Tauri's
    // resource manifest too would duplicate resource #1 in binary tests.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("PROFILE").as_deref() == Ok("debug")
    {
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    }
    tauri_build::try_build(attributes).expect("failed to run Tauri build")
}
