fn main() {
    println!("cargo:rerun-if-env-changed=MXTOOLS_UPDATER_PUBLIC_KEY");
    tauri_build::build()
}
