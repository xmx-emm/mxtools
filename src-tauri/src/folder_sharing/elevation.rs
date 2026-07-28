use super::FolderSharingError;
use getrandom::fill;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::ffi::OsStr;
use std::io;
use std::mem::{size_of, zeroed};
use std::os::windows::ffi::OsStrExt;
use std::ptr::null_mut;
use std::time::{Duration, Instant};
use winapi::shared::minwindef::{DWORD, FALSE, HLOCAL};
use winapi::shared::sddl::{ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1};
use winapi::shared::winerror::{
    ERROR_CANCELLED, ERROR_PIPE_CONNECTED, ERROR_PIPE_LISTENING, WAIT_TIMEOUT,
};
use winapi::um::errhandlingapi::GetLastError;
use winapi::um::fileapi::{CreateFileW, ReadFile, WriteFile, OPEN_EXISTING};
use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
use winapi::um::minwinbase::SECURITY_ATTRIBUTES;
use winapi::um::namedpipeapi::{ConnectNamedPipe, CreateNamedPipeW, SetNamedPipeHandleState};
use winapi::um::processthreadsapi::GetProcessId;
use winapi::um::shellapi::{
    ShellExecuteExW, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
};
use winapi::um::synchapi::WaitForSingleObject;
use winapi::um::winbase::{
    GetNamedPipeClientProcessId, LocalFree, FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_ACCESS_DUPLEX,
    PIPE_NOWAIT, PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_WAIT,
    WAIT_FAILED, WAIT_OBJECT_0,
};
use winapi::um::winnt::{GENERIC_READ, GENERIC_WRITE, HANDLE, PSECURITY_DESCRIPTOR};
use winapi::um::winuser::SW_HIDE;

const HELPER_FLAG: &str = "--folder-sharing-elevated-helper";
const MAX_FRAME_SIZE: usize = 8 * 1024 * 1024;
const HELPER_CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

struct OwnedHandle(HANDLE);

struct OwnedSecurityDescriptor(PSECURITY_DESCRIPTOR);

impl Drop for OwnedSecurityDescriptor {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                LocalFree(self.0 as HLOCAL);
            }
        }
    }
}

impl OwnedHandle {
    fn new(handle: HANDLE) -> Result<Self, FolderSharingError> {
        if handle.is_null() || handle == INVALID_HANDLE_VALUE {
            let code = unsafe { GetLastError() };
            Err(FolderSharingError::win32("elevation_pipe_failed", code))
        } else {
            Ok(Self(handle))
        }
    }
}

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        if !self.0.is_null() && self.0 != INVALID_HANDLE_VALUE {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

fn wide_null(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(std::iter::once(0)).collect()
}

fn wide_null_str(value: &str) -> Vec<u16> {
    wide_null(OsStr::new(value))
}

fn unique_pipe_and_nonce() -> Result<(String, String), FolderSharingError> {
    let mut entropy = [0u8; 32];
    fill(&mut entropy)
        .map_err(|error| FolderSharingError::new("secure_random_failed", error.to_string()))?;
    let token = hex::encode(entropy);
    Ok((
        format!(r"\\.\pipe\mxtools-folder-sharing-{}", &token[..24]),
        token[24..56].to_string(),
    ))
}

fn create_pipe(name: &str) -> Result<OwnedHandle, FolderSharingError> {
    let name = wide_null_str(name);
    // Owner, SYSTEM and Administrators only. The elevated helper may run under
    // another administrator account when the current user is not an admin.
    let sddl = wide_null_str("D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GA;;;OW)");
    let mut descriptor: PSECURITY_DESCRIPTOR = null_mut();
    let converted = unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            SDDL_REVISION_1.into(),
            &mut descriptor,
            null_mut(),
        )
    };
    if converted == FALSE {
        return Err(FolderSharingError::win32(
            "elevation_pipe_security_failed",
            unsafe { GetLastError() },
        ));
    }
    let descriptor = OwnedSecurityDescriptor(descriptor);
    let mut attributes = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as DWORD,
        lpSecurityDescriptor: descriptor.0,
        bInheritHandle: FALSE,
    };
    let handle = unsafe {
        CreateNamedPipeW(
            name.as_ptr(),
            PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_NOWAIT | PIPE_REJECT_REMOTE_CLIENTS,
            1,
            64 * 1024,
            64 * 1024,
            30_000,
            &mut attributes,
        )
    };
    OwnedHandle::new(handle)
}

fn connect_pipe(pipe: HANDLE, child: HANDLE) -> Result<(), FolderSharingError> {
    let deadline = Instant::now() + HELPER_CONNECT_TIMEOUT;
    loop {
        let connected = unsafe { ConnectNamedPipe(pipe, null_mut()) };
        if connected != FALSE {
            break;
        }

        let code = unsafe { GetLastError() };
        if code == ERROR_PIPE_CONNECTED {
            break;
        }
        if code != ERROR_PIPE_LISTENING {
            return Err(FolderSharingError::win32(
                "elevation_pipe_connect_failed",
                code,
            ));
        }

        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(FolderSharingError::new(
                "elevation_pipe_timeout",
                "Elevated helper did not connect in time",
            ));
        }
        let wait_ms = remaining.min(Duration::from_millis(50)).as_millis() as DWORD;
        match unsafe { WaitForSingleObject(child, wait_ms) } {
            WAIT_OBJECT_0 => {
                return Err(FolderSharingError::new(
                    "elevation_helper_exited",
                    "Elevated helper exited before connecting",
                ));
            }
            WAIT_TIMEOUT => {}
            WAIT_FAILED => {
                return Err(FolderSharingError::win32(
                    "elevation_helper_wait_failed",
                    unsafe { GetLastError() },
                ));
            }
            _ => {
                return Err(FolderSharingError::new(
                    "elevation_helper_wait_failed",
                    "Unexpected elevated helper wait result",
                ));
            }
        }
    }

    let mut mode = PIPE_READMODE_BYTE | PIPE_WAIT;
    let changed = unsafe { SetNamedPipeHandleState(pipe, &mut mode, null_mut(), null_mut()) };
    if changed == FALSE {
        return Err(FolderSharingError::win32(
            "elevation_pipe_mode_failed",
            unsafe { GetLastError() },
        ));
    }
    Ok(())
}

fn open_pipe(name: &str) -> Result<OwnedHandle, FolderSharingError> {
    let name = wide_null_str(name);
    let handle = unsafe {
        CreateFileW(
            name.as_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            0,
            null_mut(),
            OPEN_EXISTING,
            0,
            null_mut(),
        )
    };
    OwnedHandle::new(handle)
}

fn write_all(handle: HANDLE, mut bytes: &[u8]) -> Result<(), FolderSharingError> {
    while !bytes.is_empty() {
        let mut written = 0u32;
        let ok = unsafe {
            WriteFile(
                handle,
                bytes.as_ptr() as *const _,
                bytes.len().min(u32::MAX as usize) as u32,
                &mut written,
                null_mut(),
            )
        };
        if ok == FALSE {
            return Err(FolderSharingError::win32(
                "elevation_pipe_write_failed",
                unsafe { GetLastError() },
            ));
        }
        if written == 0 {
            return Err(FolderSharingError::new(
                "elevation_pipe_write_failed",
                "Named pipe closed while writing",
            ));
        }
        bytes = &bytes[written as usize..];
    }
    Ok(())
}

fn read_exact(handle: HANDLE, mut bytes: &mut [u8]) -> Result<(), FolderSharingError> {
    while !bytes.is_empty() {
        let mut read = 0u32;
        let ok = unsafe {
            ReadFile(
                handle,
                bytes.as_mut_ptr() as *mut _,
                bytes.len().min(u32::MAX as usize) as u32,
                &mut read,
                null_mut(),
            )
        };
        if ok == FALSE {
            return Err(FolderSharingError::win32(
                "elevation_pipe_read_failed",
                unsafe { GetLastError() },
            ));
        }
        if read == 0 {
            return Err(FolderSharingError::new(
                "elevation_pipe_read_failed",
                "Named pipe closed while reading",
            ));
        }
        let (_, rest) = bytes.split_at_mut(read as usize);
        bytes = rest;
    }
    Ok(())
}

fn write_frame<T: Serialize>(handle: HANDLE, value: &T) -> Result<(), FolderSharingError> {
    let payload = serde_json::to_vec(value).map_err(|error| {
        FolderSharingError::new("elevation_serialize_failed", error.to_string())
    })?;
    if payload.len() > MAX_FRAME_SIZE {
        return Err(FolderSharingError::new(
            "elevation_payload_too_large",
            "Elevated operation payload is too large",
        ));
    }
    write_all(handle, &(payload.len() as u32).to_le_bytes())?;
    write_all(handle, &payload)
}

fn read_frame<T: DeserializeOwned>(handle: HANDLE) -> Result<T, FolderSharingError> {
    let mut length = [0u8; 4];
    read_exact(handle, &mut length)?;
    let length = u32::from_le_bytes(length) as usize;
    if length == 0 || length > MAX_FRAME_SIZE {
        return Err(FolderSharingError::new(
            "elevation_payload_invalid",
            "Invalid elevated operation payload length",
        ));
    }
    let mut payload = vec![0u8; length];
    read_exact(handle, &mut payload)?;
    serde_json::from_slice(&payload)
        .map_err(|error| FolderSharingError::new("elevation_deserialize_failed", error.to_string()))
}

fn launch_helper(pipe_name: &str, nonce: &str) -> Result<OwnedHandle, FolderSharingError> {
    let exe = std::env::current_exe()?;
    let exe_wide = wide_null(exe.as_os_str());
    let verb = wide_null_str("runas");
    let params = format!(r#"{} "{}" "{}""#, HELPER_FLAG, pipe_name, nonce);
    let params_wide = wide_null_str(&params);
    let mut info: SHELLEXECUTEINFOW = unsafe { zeroed() };
    info.cbSize = size_of::<SHELLEXECUTEINFOW>() as DWORD;
    info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
    info.lpVerb = verb.as_ptr();
    info.lpFile = exe_wide.as_ptr();
    info.lpParameters = params_wide.as_ptr();
    info.nShow = SW_HIDE;
    let ok = unsafe { ShellExecuteExW(&mut info) };
    if ok == FALSE {
        let code = unsafe { GetLastError() };
        return Err(if code == ERROR_CANCELLED {
            FolderSharingError::win32("user_cancelled", code)
        } else {
            FolderSharingError::win32("elevation_launch_failed", code)
        });
    }
    OwnedHandle::new(info.hProcess)
}

pub fn run_elevated<T, R>(operation: T) -> Result<R, FolderSharingError>
where
    T: Serialize,
    R: DeserializeOwned,
{
    let (pipe_name, nonce) = unique_pipe_and_nonce()?;
    let pipe = create_pipe(&pipe_name)?;
    let child = launch_helper(&pipe_name, &nonce)?;
    connect_pipe(pipe.0, child.0)?;

    let child_pid = unsafe { GetProcessId(child.0) };
    let mut client_pid = 0u32;
    let got_pid = unsafe { GetNamedPipeClientProcessId(pipe.0, &mut client_pid) };
    if got_pid == FALSE || child_pid == 0 || client_pid != child_pid {
        return Err(FolderSharingError::new(
            "elevation_client_mismatch",
            "Elevated helper identity could not be verified",
        ));
    }

    let hello: String = read_frame(pipe.0)?;
    if hello != nonce {
        return Err(FolderSharingError::new(
            "elevation_nonce_mismatch",
            "Elevated helper authentication failed",
        ));
    }
    write_frame(pipe.0, &operation)?;
    read_frame(pipe.0)
}

pub fn try_run_helper<T, R, F>(handler: F) -> Option<i32>
where
    T: DeserializeOwned,
    R: Serialize,
    F: FnOnce(T) -> R,
{
    let args: Vec<String> = std::env::args().collect();
    let index = args.iter().position(|arg| arg == HELPER_FLAG)?;
    if args.len() <= index + 2 {
        return Some(2);
    }
    if !crate::elevated::is_elevated() {
        return Some(3);
    }
    let pipe_name = &args[index + 1];
    let nonce = &args[index + 2];
    let outcome = (|| -> Result<(), FolderSharingError> {
        let pipe = open_pipe(pipe_name)?;
        write_frame(pipe.0, nonce)?;
        let operation: T = read_frame(pipe.0)?;
        let response = handler(operation);
        write_frame(pipe.0, &response)
    })();
    Some(if outcome.is_ok() { 0 } else { 4 })
}

#[allow(dead_code)]
fn io_error(code: &'static str, error: io::Error) -> FolderSharingError {
    FolderSharingError::new(code, error.to_string())
}
