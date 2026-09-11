#![windows_subsystem = "windows"]
fn main() {
    let report = std::env::var_os("MXTOOLS_PORTABLE_FIXTURE_REPORT").unwrap();
    let content = format!(
        "{}\n{}\n{}\n{}\n{}\n",
        std::process::id(),
        std::env::current_exe().unwrap().display(),
        std::env::var("MXTOOLS_PORTABLE_LAUNCHER").unwrap_or_default(),
        std::env::var("MXTOOLS_PORTABLE_PID").unwrap_or_default(),
        if cfg!(portable_next) { "new" } else { "old" }
    );
    std::fs::write(report, content).unwrap();
    if let Some(stop) = std::env::var_os("MXTOOLS_PORTABLE_FIXTURE_STOP") {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
        while !std::path::Path::new(&stop).is_file() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
    }
}
