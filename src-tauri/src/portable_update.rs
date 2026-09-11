//! Replace the original portable launcher, never the versioned payload cache.
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

const HELPER: &str = "--mxtools-portable-update";
const LIMIT: u64 = 10_000_000;

#[derive(Clone)]
pub struct Context {
    launcher: PathBuf,
    pid: u32,
}

#[derive(Serialize, Deserialize)]
struct Plan {
    launcher: PathBuf,
    launcher_pid: u32,
    app_pid: u32,
    original_hash: String,
    signature: String,
}

fn read_bounded(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("Portable update file exceeds size limit".into());
    }
    Ok(bytes)
}

fn hash(path: &Path) -> Result<String, String> {
    Ok(hex::encode(Sha256::digest(read_bounded(path, LIMIT)?)))
}

fn verify(bytes: &[u8], signature: &str, key: &str) -> Result<(), String> {
    let decode = |text: &str| -> Result<String, String> {
        String::from_utf8(
            base64::engine::general_purpose::STANDARD
                .decode(text.trim())
                .map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())
    };
    let key = minisign_verify::PublicKey::decode(&decode(key)?).map_err(|e| e.to_string())?;
    let signature =
        minisign_verify::Signature::decode(&decode(signature)?).map_err(|e| e.to_string())?;
    key.verify(bytes, &signature, true)
        .map_err(|e| e.to_string())
}

#[cfg(windows)]
struct Process(std::os::windows::io::OwnedHandle);

#[cfg(windows)]
impl Process {
    fn open(pid: u32, expected: &Path) -> Result<Self, String> {
        use std::os::windows::io::{AsRawHandle, FromRawHandle};
        use winapi::um::processthreadsapi::OpenProcess;
        use winapi::um::winbase::QueryFullProcessImageNameW;
        use winapi::um::winnt::{PROCESS_QUERY_LIMITED_INFORMATION, SYNCHRONIZE};
        let raw = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, 0, pid) };
        if raw.is_null() {
            return Err("Portable parent process is no longer available".into());
        }
        let handle = unsafe { std::os::windows::io::OwnedHandle::from_raw_handle(raw.cast()) };
        let mut path = vec![0u16; 32768];
        let mut length = path.len() as u32;
        if unsafe {
            QueryFullProcessImageNameW(
                handle.as_raw_handle().cast(),
                0,
                path.as_mut_ptr(),
                &mut length,
            )
        } == 0
        {
            return Err("Cannot verify portable parent process".into());
        }
        let actual = PathBuf::from(String::from_utf16_lossy(&path[..length as usize]));
        if actual.canonicalize().ok() != Some(expected.canonicalize().map_err(|e| e.to_string())?) {
            return Err("Portable parent executable does not match".into());
        }
        Ok(Self(handle))
    }

    fn wait(&self) -> Result<(), String> {
        use std::os::windows::io::AsRawHandle;
        if unsafe {
            winapi::um::synchapi::WaitForSingleObject(self.0.as_raw_handle().cast(), 60_000)
        } != 0
        {
            return Err(
                "Timed out waiting for portable application to exit; original file preserved"
                    .into(),
            );
        }
        Ok(())
    }
}

pub fn context() -> Option<Context> {
    #[cfg(windows)]
    {
        let launcher = PathBuf::from(std::env::var_os("MXTOOLS_PORTABLE_LAUNCHER")?)
            .canonicalize()
            .ok()?;
        let pid = std::env::var("MXTOOLS_PORTABLE_PID").ok()?.parse().ok()?;
        Process::open(pid, &launcher).ok()?;
        (launcher.extension()?.eq_ignore_ascii_case("exe")).then_some(Context { launcher, pid })
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[cfg(windows)]
pub fn autostart_launcher(name: &str) -> Option<auto_launch::AutoLaunch> {
    let context = context()?;
    auto_launch::AutoLaunchBuilder::new()
        .set_app_name(name)
        .set_app_path(&quoted_launcher_path(&context.launcher))
        .set_args(&["--autostart"])
        .build()
        .ok()
}

#[cfg(windows)]
fn quoted_launcher_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    let normal = if let Some(unc) = text.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
    };
    format!("\"{normal}\"")
}

#[cfg(windows)]
fn cached_autostart_target(command: &str) -> Option<&Path> {
    command
        .trim()
        .strip_suffix(" --autostart")
        .map(|p| Path::new(p.trim().trim_matches('"')))
}

/// Migrate only an enabled entry pointing to this cached payload, never another installation.
#[cfg(windows)]
pub fn migrate_cached_autostart(name: &str) -> Result<(), String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let Some(launcher) = autostart_launcher(name) else {
        return Ok(());
    };
    let Ok(key) = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
    else {
        return Ok(());
    };
    let Ok(command) = key.get_value::<String, _>(name) else {
        return Ok(());
    };
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    if cached_autostart_target(&command).and_then(|p| p.canonicalize().ok())
        == Some(current.canonicalize().map_err(|e| e.to_string())?)
        && launcher.is_enabled().map_err(|e| e.to_string())?
    {
        launcher.enable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Stage only already verified bytes. The helper re-verifies before replacing anything.
pub async fn prepare(context: Context, bytes: &[u8], signature: &str) -> Result<(), String> {
    let parent = context
        .launcher
        .parent()
        .ok_or("Invalid portable launcher path")?;
    if fs::metadata(&context.launcher)
        .map_err(|e| e.to_string())?
        .permissions()
        .readonly()
    {
        return Err("Portable launcher is read-only; move it to a writable directory".into());
    }
    let mut nonce = [0u8; 12];
    getrandom::fill(&mut nonce).map_err(|e| e.to_string())?;
    let directory = parent.join(format!(".mxtools-update-{}", hex::encode(nonce)));
    fs::create_dir(&directory).map_err(|e| format!("Portable directory is not writable: {e}"))?;
    let result = async {
        let original_hash = hash(&context.launcher)?;
        let plan = Plan {
            launcher: context.launcher,
            launcher_pid: context.pid,
            app_pid: std::process::id(),
            original_hash,
            signature: signature.into(),
        };
        fs::write(directory.join("update.exe"), bytes).map_err(|e| e.to_string())?;
        let plan_path = directory.join("plan.json");
        fs::write(
            &plan_path,
            serde_json::to_vec(&plan).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let mut command = Command::new(std::env::current_exe().map_err(|e| e.to_string())?);
        command.arg(HELPER).arg(&plan_path);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|e| e.to_string())?;
        let deadline = Instant::now() + Duration::from_secs(15);
        while !directory.join("ready").is_file() {
            if child.try_wait().map_err(|e| e.to_string())?.is_some() {
                return Err(fs::read_to_string(directory.join("error.txt"))
                    .unwrap_or("Portable update helper failed".into()));
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Portable update helper did not become ready".into());
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        Ok(())
    }
    .await;
    if result.is_err() {
        clean_staging(&directory);
    }
    result
}

fn clean_staging(directory: &Path) {
    // Only exact files created by this workflow; never recursively delete a path from a request.
    for name in ["update.exe", "plan.json", "ready", "error.txt"] {
        let _ = fs::remove_file(directory.join(name));
    }
    let _ = fs::remove_dir(directory);
}

fn replace_and_restart<F: FnOnce(&Path) -> Result<(), String>>(
    directory: &Path,
    plan: &Plan,
    restart: F,
) -> Result<(), String> {
    if hash(&plan.launcher)? != plan.original_hash {
        return Err("Portable launcher changed since update confirmation".into());
    }
    let backup = directory.join("previous.exe");
    if backup.exists() {
        return Err("Portable update backup already exists".into());
    }
    fs::rename(&plan.launcher, &backup).map_err(|e| e.to_string())?;
    if let Err(e) = fs::rename(directory.join("update.exe"), &plan.launcher) {
        fs::rename(&backup, &plan.launcher).map_err(|restore| {
            format!(
                "{e}; restore failed: {restore}; backup: {}",
                backup.display()
            )
        })?;
        return Err(e.to_string());
    }
    if let Err(e) = restart(&plan.launcher) {
        // Move the failed replacement aside before restoring the original.
        fs::rename(&plan.launcher, directory.join("update.exe"))
            .map_err(|restore| format!("{e}; rollback: {restore}"))?;
        fs::rename(&backup, &plan.launcher)
            .map_err(|restore| format!("{e}; restore: {restore}"))?;
        return Err(e);
    }
    let _ = fs::remove_file(backup);
    clean_staging(directory);
    Ok(())
}

#[cfg(windows)]
fn run_helper(plan_path: &Path) -> Result<(), String> {
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).map_err(|e| e.to_string())?;
    run_verified_helper(
        plan_path,
        &current,
        config["plugins"]["updater"]["pubkey"]
            .as_str()
            .ok_or("Missing signing key")?,
    )
}

#[cfg(windows)]
fn run_verified_helper(plan_path: &Path, current: &Path, key: &str) -> Result<(), String> {
    let directory = plan_path
        .parent()
        .ok_or("Missing update directory")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let plan: Plan =
        serde_json::from_slice(&read_bounded(plan_path, 65536)?).map_err(|e| e.to_string())?;
    if plan_path.file_name() != Some(std::ffi::OsStr::new("plan.json"))
        || !directory
            .file_name()
            .is_some_and(|s| s.to_string_lossy().starts_with(".mxtools-update-"))
        || plan.launcher.parent().and_then(|p| p.canonicalize().ok())
            != directory.parent().map(Path::to_path_buf)
        || !plan
            .launcher
            .extension()
            .is_some_and(|s| s.eq_ignore_ascii_case("exe"))
    {
        return Err("Invalid portable update paths".into());
    }
    let app = Process::open(plan.app_pid, current)?;
    let launcher = Process::open(plan.launcher_pid, &plan.launcher)?;
    let bytes = read_bounded(&directory.join("update.exe"), LIMIT)?;
    verify(&bytes, &plan.signature, key)?;
    // Flush verified bytes before signalling the app to exit.
    fs::OpenOptions::new()
        .write(true)
        .open(directory.join("update.exe"))
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())?;
    let mut ready = fs::File::create(directory.join("ready")).map_err(|e| e.to_string())?;
    ready.write_all(b"ready").map_err(|e| e.to_string())?;
    app.wait()?;
    launcher.wait()?;
    // Detect any mutation during the exit handshake.
    if read_bounded(&directory.join("update.exe"), LIMIT)? != bytes {
        return Err("Staged portable update changed".into());
    }
    replace_and_restart(&directory, &plan, |path| {
        Command::new(path)
            .current_dir(path.parent().ok_or("Missing launcher directory")?)
            .env_remove("MXTOOLS_PORTABLE_LAUNCHER")
            .env_remove("MXTOOLS_PORTABLE_PID")
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    })
}

pub fn try_run_helper() -> Option<i32> {
    let args: Vec<_> = std::env::args_os().collect();
    if args.get(1) != Some(&std::ffi::OsString::from(HELPER)) {
        return None;
    }
    #[cfg(windows)]
    let result = if args.len() == 3 {
        run_helper(Path::new(&args[2]))
    } else {
        Err("Invalid updater arguments".into())
    };
    #[cfg(not(windows))]
    let result: Result<(), String> = Err("Portable updates require Windows".into());
    if let Err(message) = result {
        if let Some(directory) = args.get(2).and_then(|p| Path::new(p).parent()) {
            let _ = fs::write(directory.join("error.txt"), &message);
            #[cfg(windows)]
            if directory.join("ready").is_file() {
                let text: Vec<u16> = format!(
                    "便携版更新未完成 / Portable update failed\n{message}\n{}",
                    directory.display()
                )
                .encode_utf16()
                .chain(Some(0))
                .collect();
                let title: Vec<u16> = "MxTools\0".encode_utf16().collect();
                unsafe {
                    winapi::um::winuser::MessageBoxW(
                        std::ptr::null_mut(),
                        text.as_ptr(),
                        title.as_ptr(),
                        0x10,
                    );
                }
            }
        }
        eprintln!("{message}");
        return Some(1);
    }
    Some(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/portable_update.rs"
    ));
}
