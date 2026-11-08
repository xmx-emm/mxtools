use crate::ipc_error::{IpcError, IpcResult};
use windows_tool::elevated::is_elevated as windows_is_elevated;

/// The elevated copy waits for this PID to exit before tauri's single-instance
/// check runs; otherwise it would find the old instance and delegate to it.
const RELAUNCH_AFTER_FLAG: &str = "--elevated-relaunch-after";
const RELAUNCH_WAIT_MS: u32 = 15_000;

/// 返回是否有管理员权限
#[tauri::command]
pub fn is_elevated() -> bool {
    windows_is_elevated()
}

/// 特权命令统一门控：未提升时返回 Err，避免仅靠前端禁用。
pub fn require_elevated() -> Result<(), String> {
    if windows_is_elevated() {
        Ok(())
    } else {
        Err("elevation.needAdmin".to_string())
    }
}

/// 提升权限并重启。成功后始终退出当前进程，避免 debug 下双实例并存、横幅不消失。
#[tauri::command]
pub fn restart_request_elevation() -> IpcResult<()> {
    launch_elevated_copy(std::process::id())
        .map_err(|error| IpcError::operation_failed("elevation", error))?;
    std::process::exit(0);
}

fn relaunch_parent_pid<I, S>(args: I) -> Option<u32>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut args = args.into_iter();
    while let Some(argument) = args.next() {
        if argument.as_ref() == RELAUNCH_AFTER_FLAG {
            return args.next()?.as_ref().parse().ok().filter(|pid| *pid != 0);
        }
    }
    None
}

/// Called before the tauri builder so the previous instance has released the
/// single-instance mutex by the time the plugin initializes.
pub fn wait_for_relaunch_parent() {
    let Some(pid) = relaunch_parent_pid(std::env::args().skip(1)) else {
        return;
    };
    #[cfg(windows)]
    unsafe {
        use winapi::um::handleapi::CloseHandle;
        use winapi::um::processthreadsapi::OpenProcess;
        use winapi::um::synchapi::WaitForSingleObject;
        use winapi::um::winnt::SYNCHRONIZE;

        let handle = OpenProcess(SYNCHRONIZE, 0, pid);
        if !handle.is_null() {
            WaitForSingleObject(handle, RELAUNCH_WAIT_MS);
            CloseHandle(handle);
        }
    }
}

#[cfg(windows)]
fn launch_elevated_copy(parent_pid: u32) -> Result<(), String> {
    use std::mem::{size_of, zeroed};
    use std::os::windows::ffi::OsStrExt;
    use winapi::shared::winerror::ERROR_CANCELLED;
    use winapi::um::errhandlingapi::GetLastError;
    use winapi::um::shellapi::{ShellExecuteExW, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW};
    use winapi::um::winuser::SW_SHOWNORMAL;

    fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
        value.encode_wide().chain(Some(0)).collect()
    }

    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let exe_wide = wide(exe.as_os_str());
    let verb = wide("runas".as_ref());
    let params = wide(format!("{RELAUNCH_AFTER_FLAG} {parent_pid}").as_ref());
    let mut info: SHELLEXECUTEINFOW = unsafe { zeroed() };
    info.cbSize = size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOASYNC;
    info.lpVerb = verb.as_ptr();
    info.lpFile = exe_wide.as_ptr();
    info.lpParameters = params.as_ptr();
    info.nShow = SW_SHOWNORMAL;
    if unsafe { ShellExecuteExW(&mut info) } == 0 {
        let code = unsafe { GetLastError() };
        return Err(if code == ERROR_CANCELLED {
            "用户取消授权".to_string()
        } else {
            format!("提权失败 (Win32 {code})")
        });
    }
    Ok(())
}

#[cfg(not(windows))]
fn launch_elevated_copy(_parent_pid: u32) -> Result<(), String> {
    Err("elevation is only supported on Windows".to_string())
}

#[cfg(test)]
mod relaunch {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/elevated_relaunch.rs"
    ));
}
