use crate::ipc_error::{IpcError, IpcResult};

#[cfg(windows)]
use std::fs;
#[cfg(windows)]
use std::path::Path;
#[cfg(windows)]
use std::process::Command;
#[cfg(windows)]
use std::sync::{Mutex, TryLockError};
#[cfg(windows)]
use std::thread;
#[cfg(windows)]
use std::time::{Duration, Instant};

#[cfg(windows)]
use sysinfo::{ProcessesToUpdate, System};
#[cfg(windows)]
use winapi::shared::minwindef::FALSE;
#[cfg(windows)]
use winapi::um::handleapi::CloseHandle;
#[cfg(windows)]
use winapi::um::processthreadsapi::{OpenProcess, ProcessIdToSessionId, TerminateProcess};
#[cfg(windows)]
use winapi::um::synchapi::WaitForSingleObject;
#[cfg(windows)]
use winapi::um::winbase::{WAIT_FAILED, WAIT_OBJECT_0};
#[cfg(windows)]
use winapi::um::winnt::{PROCESS_TERMINATE, SYNCHRONIZE};
#[cfg(windows)]
use winapi::um::winuser::{GetShellWindow, GetWindowThreadProcessId};

#[cfg(windows)]
static ICON_CACHE_REPAIR_LOCK: Mutex<()> = Mutex::new(());

#[cfg(windows)]
const PROCESS_WAIT_TIMEOUT_MS: u32 = 5_000;
#[cfg(windows)]
const WAIT_TIMEOUT: u32 = 258;

fn windows_error(reason: &str, message: impl Into<String>) -> IpcError {
    IpcError::new(format!("windows.{reason}"), message)
}

#[cfg(windows)]
fn current_session_id() -> IpcResult<u32> {
    let mut session_id = 0;
    let ok = unsafe { ProcessIdToSessionId(std::process::id(), &mut session_id) };
    if ok == 0 {
        return Err(windows_error(
            "session_read_failed",
            std::io::Error::last_os_error().to_string(),
        ));
    }
    Ok(session_id)
}

#[cfg(windows)]
fn explorer_pids_in_session(session_id: u32) -> Vec<u32> {
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);

    let mut pids = system
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            let is_explorer = process
                .name()
                .to_string_lossy()
                .eq_ignore_ascii_case("explorer.exe");
            let is_current_session = process
                .session_id()
                .is_some_and(|value| value.as_u32() == session_id);
            (is_explorer && is_current_session).then(|| pid.as_u32())
        })
        .collect::<Vec<_>>();
    pids.sort_unstable();
    pids
}

#[cfg(windows)]
fn terminate_explorer_process(pid: u32) -> Result<(), String> {
    const ERROR_INVALID_PARAMETER: i32 = 87;

    let handle = unsafe { OpenProcess(PROCESS_TERMINATE | SYNCHRONIZE, FALSE, pid) };
    if handle.is_null() {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(ERROR_INVALID_PARAMETER) {
            return Ok(());
        }
        return Err(format!("PID {pid}: {error}"));
    }

    let terminate_ok = unsafe { TerminateProcess(handle, 0) };
    if terminate_ok == 0 {
        let error = std::io::Error::last_os_error();
        let already_exited = unsafe { WaitForSingleObject(handle, 0) } == WAIT_OBJECT_0;
        if !already_exited {
            unsafe { CloseHandle(handle) };
            return Err(format!("PID {pid}: {error}"));
        }
    }

    let wait_result = unsafe { WaitForSingleObject(handle, PROCESS_WAIT_TIMEOUT_MS) };
    unsafe { CloseHandle(handle) };
    match wait_result {
        WAIT_OBJECT_0 => Ok(()),
        WAIT_TIMEOUT => Err(format!("PID {pid}: timed out waiting for Explorer to stop")),
        WAIT_FAILED => Err(format!("PID {pid}: {}", std::io::Error::last_os_error())),
        value => Err(format!("PID {pid}: unexpected wait result {value}")),
    }
}

#[cfg(windows)]
fn stop_current_session_explorer(session_id: u32) -> IpcResult<()> {
    let failures = explorer_pids_in_session(session_id)
        .into_iter()
        .filter_map(|pid| terminate_explorer_process(pid).err())
        .collect::<Vec<_>>();

    if failures.is_empty() {
        Ok(())
    } else {
        Err(windows_error(
            "explorer_stop_failed",
            "One or more Explorer processes could not be stopped",
        )
        .with_detail("detail", failures.join("; ")))
    }
}

#[cfg(windows)]
fn is_modern_icon_cache_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.starts_with("iconcache") && lower.ends_with(".db")
}

#[cfg(windows)]
fn remove_file_if_present(path: &Path, failures: &mut Vec<String>) {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => failures.push(format!("{}: {error}", path.display())),
    }
}

#[cfg(windows)]
fn clear_icon_cache_files(local_app_data: &Path) -> IpcResult<()> {
    let mut failures = Vec::new();
    remove_file_if_present(&local_app_data.join("IconCache.db"), &mut failures);

    let explorer_cache_dir = local_app_data
        .join("Microsoft")
        .join("Windows")
        .join("Explorer");
    match fs::read_dir(&explorer_cache_dir) {
        Ok(entries) => {
            for entry in entries {
                match entry {
                    Ok(entry) => {
                        let name = entry.file_name();
                        if is_modern_icon_cache_name(&name.to_string_lossy()) {
                            remove_file_if_present(&entry.path(), &mut failures);
                        }
                    }
                    Err(error) => {
                        failures.push(format!("{}: {error}", explorer_cache_dir.display()))
                    }
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => failures.push(format!("{}: {error}", explorer_cache_dir.display())),
    }

    if failures.is_empty() {
        Ok(())
    } else {
        Err(windows_error(
            "icon_cache_clear_failed",
            "One or more icon cache files could not be removed",
        )
        .with_detail("detail", failures.join("; ")))
    }
}

#[cfg(windows)]
fn shell_is_ready_in_session(session_id: u32) -> bool {
    let window = unsafe { GetShellWindow() };
    if window.is_null() {
        return false;
    }

    let mut pid = 0;
    unsafe { GetWindowThreadProcessId(window, &mut pid) };
    if pid == 0 {
        return false;
    }

    let mut shell_session_id = 0;
    let ok = unsafe { ProcessIdToSessionId(pid, &mut shell_session_id) };
    ok != 0 && shell_session_id == session_id
}

#[cfg(windows)]
fn wait_for_shell(session_id: u32, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if shell_is_ready_in_session(session_id) {
            return true;
        }
        thread::sleep(Duration::from_millis(100));
    }
    shell_is_ready_in_session(session_id)
}

#[cfg(windows)]
fn ensure_explorer_running(session_id: u32) -> IpcResult<()> {
    ensure_shell_running(
        || shell_is_ready_in_session(session_id),
        || wait_for_shell(session_id, Duration::from_secs(8)),
        || {
            Command::new("explorer.exe").spawn().map_err(|error| {
                windows_error("explorer_restart_failed", error.to_string())
                    .with_detail("recoveryCommand", "explorer.exe")
            })?;

            if wait_for_shell(session_id, Duration::from_secs(8)) {
                Ok(())
            } else {
                Err(windows_error(
                    "explorer_restart_failed",
                    "Explorer did not become ready before the timeout",
                )
                .with_detail("recoveryCommand", "explorer.exe"))
            }
        },
    )
}

fn ensure_shell_running<IsReady, WaitForAutomaticRestart, StartFallback>(
    is_ready: IsReady,
    wait_for_automatic_restart: WaitForAutomaticRestart,
    start_fallback: StartFallback,
) -> IpcResult<()>
where
    IsReady: FnOnce() -> bool,
    WaitForAutomaticRestart: FnOnce() -> bool,
    StartFallback: FnOnce() -> IpcResult<()>,
{
    if is_ready() || wait_for_automatic_restart() {
        return Ok(());
    }

    start_fallback()
}

fn run_repair_workflow<Stop, Clear, Restart>(
    stop: Stop,
    clear: Clear,
    restart: Restart,
) -> IpcResult<()>
where
    Stop: FnOnce() -> IpcResult<()>,
    Clear: FnOnce() -> IpcResult<()>,
    Restart: FnOnce() -> IpcResult<()>,
{
    let stop_result = stop();
    let clear_result = clear();
    let restart_result = restart();

    restart_result?;
    stop_result?;
    clear_result
}

#[cfg(windows)]
fn repair_windows_icon_cache_inner() -> IpcResult<()> {
    let _guard = match ICON_CACHE_REPAIR_LOCK.try_lock() {
        Ok(guard) => guard,
        Err(TryLockError::WouldBlock) => {
            return Err(windows_error(
                "repair_in_progress",
                "An icon cache repair is already in progress",
            ));
        }
        Err(TryLockError::Poisoned(error)) => error.into_inner(),
    };

    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_absolute())
        .ok_or_else(|| {
            windows_error("local_app_data_unavailable", "LOCALAPPDATA is unavailable")
        })?;
    let session_id = current_session_id()?;

    run_repair_workflow(
        || stop_current_session_explorer(session_id),
        || clear_icon_cache_files(&local_app_data),
        || ensure_explorer_running(session_id),
    )
}

#[tauri::command]
pub async fn repair_windows_icon_cache() -> IpcResult<()> {
    #[cfg(windows)]
    {
        tokio::task::spawn_blocking(repair_windows_icon_cache_inner)
            .await
            .map_err(|error| windows_error("operation_failed", error.to_string()))?
    }
    #[cfg(not(windows))]
    {
        Err(windows_error(
            "windows_only",
            "Icon cache repair is only supported on Windows",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[cfg(windows)]
    #[test]
    fn clears_only_icon_cache_database_files() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "mxtools-icon-cache-test-{}-{unique}",
            std::process::id()
        ));
        let explorer = root.join("Microsoft").join("Windows").join("Explorer");
        fs::create_dir_all(&explorer).unwrap();

        let legacy = root.join("IconCache.db");
        let modern = explorer.join("iconcache_32.db");
        let thumbnail = explorer.join("thumbcache_32.db");
        let backup = explorer.join("iconcache_32.db.bak");
        fs::write(&legacy, b"legacy").unwrap();
        fs::write(&modern, b"modern").unwrap();
        fs::write(&thumbnail, b"thumbnail").unwrap();
        fs::write(&backup, b"backup").unwrap();

        clear_icon_cache_files(&root).unwrap();

        assert!(!legacy.exists());
        assert!(!modern.exists());
        assert!(thumbnail.exists());
        assert!(backup.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn restart_is_attempted_and_its_error_takes_priority() {
        let restart_called = AtomicBool::new(false);
        let result = run_repair_workflow(
            || Ok(()),
            || Err(windows_error("icon_cache_clear_failed", "clear failed")),
            || {
                restart_called.store(true, Ordering::SeqCst);
                Err(windows_error("explorer_restart_failed", "restart failed"))
            },
        );

        assert!(restart_called.load(Ordering::SeqCst));
        assert_eq!(result.unwrap_err().code, "windows.explorer_restart_failed");
    }

    #[test]
    fn automatic_shell_restart_skips_manual_explorer_launch() {
        let fallback_called = AtomicBool::new(false);
        ensure_shell_running(
            || false,
            || true,
            || {
                fallback_called.store(true, Ordering::SeqCst);
                Ok(())
            },
        )
        .unwrap();

        assert!(!fallback_called.load(Ordering::SeqCst));
    }
}
