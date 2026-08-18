//! Windows 凭据管理器存储：令牌加密落盘，不写入任何明文配置文件。

use std::ffi::OsStr;
use std::iter::once;
use std::os::windows::ffi::OsStrExt;
use std::ptr;
use winapi::shared::minwindef::FILETIME;
use winapi::um::errhandlingapi::GetLastError;
use winapi::um::wincred::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
    CRED_TYPE_GENERIC, PCREDENTIALW,
};

const TARGET_NAME: &str = "MxTools/OnlineAccount";
const USER_NAME: &str = "mxtools";
/// Win32 `ERROR_NOT_FOUND`（winapi 未启用 winerror feature，这里内联常量）。
const ERROR_NOT_FOUND: u32 = 1168;

fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value).encode_wide().chain(once(0)).collect()
}

pub fn save(blob: &[u8]) -> Result<(), u32> {
    let mut target = wide(TARGET_NAME);
    let mut user = wide(USER_NAME);
    let mut credential = CREDENTIALW {
        Flags: 0,
        Type: CRED_TYPE_GENERIC,
        TargetName: target.as_mut_ptr(),
        Comment: ptr::null_mut(),
        LastWritten: FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        },
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_ptr() as *mut u8,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        AttributeCount: 0,
        Attributes: ptr::null_mut(),
        TargetAlias: ptr::null_mut(),
        UserName: user.as_mut_ptr(),
    };
    let ok = unsafe { CredWriteW(&mut credential, 0) };
    if ok == 0 {
        return Err(unsafe { GetLastError() });
    }
    Ok(())
}

pub fn load() -> Result<Option<Vec<u8>>, u32> {
    let target = wide(TARGET_NAME);
    let mut handle: PCREDENTIALW = ptr::null_mut();
    let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut handle) };
    if ok == 0 {
        let code = unsafe { GetLastError() };
        return if code == ERROR_NOT_FOUND {
            Ok(None)
        } else {
            Err(code)
        };
    }
    let blob = unsafe {
        let credential = &*handle;
        std::slice::from_raw_parts(
            credential.CredentialBlob,
            credential.CredentialBlobSize as usize,
        )
        .to_vec()
    };
    unsafe { CredFree(handle as *mut _) };
    Ok(Some(blob))
}

pub fn delete() -> Result<(), u32> {
    let target = wide(TARGET_NAME);
    let ok = unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) };
    if ok == 0 {
        let code = unsafe { GetLastError() };
        if code != ERROR_NOT_FOUND {
            return Err(code);
        }
    }
    Ok(())
}
