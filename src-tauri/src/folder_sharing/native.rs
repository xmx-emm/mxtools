use super::{
    FolderSharingError, LocalShare, MappedDrive, NetworkDevice, RemoteConnectionRequest,
    RemoteShare,
};
use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::mem::{size_of, zeroed};
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::process::Command;
use std::ptr::{null, null_mut};
use std::slice;
use winapi::shared::lmcons::MAX_PREFERRED_LENGTH;
use winapi::shared::minwindef::{DWORD, FALSE, LPBYTE, TRUE};
use winapi::shared::winerror::{
    ERROR_CANCELLED, ERROR_MORE_DATA, ERROR_NO_MORE_ITEMS, ERROR_SESSION_CREDENTIAL_CONFLICT,
    NO_ERROR,
};
use winapi::um::lmapibuf::NetApiBufferFree;
use winapi::um::lmshare::{
    NetShareEnum, SHARE_INFO_1, SHARE_INFO_2, STYPE_DISKTREE, STYPE_MASK, STYPE_SPECIAL,
    STYPE_TEMPORARY,
};
use winapi::um::wincred::{
    CredDeleteW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_DOMAIN_PASSWORD,
};
use winapi::um::winnetwk::{
    WNetAddConnection2W, WNetAddConnection3W, WNetCancelConnection2W, WNetCloseEnum,
    WNetEnumResourceW, WNetOpenEnumW, CONNECT_INTERACTIVE, CONNECT_PROMPT, CONNECT_UPDATE_PROFILE,
    NETRESOURCEW, RESOURCEDISPLAYTYPE_SERVER, RESOURCEDISPLAYTYPE_SHARE,
    RESOURCEDISPLAYTYPE_SHAREADMIN, RESOURCETYPE_DISK, RESOURCEUSAGE_CONNECTABLE,
    RESOURCEUSAGE_CONTAINER, RESOURCE_CONNECTED, RESOURCE_CONTEXT, RESOURCE_GLOBALNET,
    RESOURCE_REMEMBERED,
};
use winapi::um::winnt::HANDLE;
use zeroize::Zeroize;

struct NetApiBuffer(*mut u8);

impl Drop for NetApiBuffer {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                NetApiBufferFree(self.0 as *mut _);
            }
        }
    }
}

struct WNetEnumHandle(HANDLE);

impl Drop for WNetEnumHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                WNetCloseEnum(self.0);
            }
        }
    }
}

fn wide_null(value: &str) -> Vec<u16> {
    OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

unsafe fn wide_ptr_to_string(ptr: *const u16) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0usize;
    while *ptr.add(len) != 0 {
        len += 1;
    }
    String::from_utf16_lossy(slice::from_raw_parts(ptr, len))
}

fn server_pointer(server: Option<&str>) -> (Vec<u16>, *mut u16) {
    match server {
        Some(value) => {
            let mut wide = wide_null(value);
            let ptr = wide.as_mut_ptr();
            (wide, ptr)
        }
        None => (Vec::new(), null_mut()),
    }
}

pub fn list_local_shares() -> Result<Vec<LocalShare>, FolderSharingError> {
    let computer_name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "localhost".into());
    let mut result = Vec::new();
    let mut resume = 0u32;

    loop {
        let mut buffer: LPBYTE = null_mut();
        let mut entries_read = 0u32;
        let mut total_entries = 0u32;
        let status = unsafe {
            NetShareEnum(
                null_mut(),
                2,
                &mut buffer,
                MAX_PREFERRED_LENGTH,
                &mut entries_read,
                &mut total_entries,
                &mut resume,
            )
        };
        let owned = NetApiBuffer(buffer);
        if status != NO_ERROR && status != ERROR_MORE_DATA {
            return Err(FolderSharingError::win32("share_list_failed", status));
        }

        if !owned.0.is_null() && entries_read > 0 {
            let entries = unsafe {
                slice::from_raw_parts(owned.0 as *const SHARE_INFO_2, entries_read as usize)
            };
            for entry in entries {
                let name = unsafe { wide_ptr_to_string(entry.shi2_netname) };
                let path = unsafe { wide_ptr_to_string(entry.shi2_path) };
                let description = unsafe { wide_ptr_to_string(entry.shi2_remark) };
                result.push(LocalShare {
                    unc_path: format!(r"\\{}\{}", computer_name, name),
                    name,
                    path,
                    description,
                    current_users: entry.shi2_current_uses,
                    special: entry.shi2_type & STYPE_SPECIAL != 0,
                    temporary: entry.shi2_type & STYPE_TEMPORARY != 0,
                    disk_share: entry.shi2_type & STYPE_MASK == STYPE_DISKTREE,
                });
            }
        }

        if status != ERROR_MORE_DATA {
            break;
        }
    }

    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

pub fn list_remote_shares(server: &str) -> Result<Vec<RemoteShare>, FolderSharingError> {
    let normalized = normalize_server(server)?;
    let remote_server = format!(r"\\{}", normalized);
    let (_wide_server, server_ptr) = server_pointer(Some(&remote_server));
    let mut result = Vec::new();
    let mut resume = 0u32;

    loop {
        let mut buffer: LPBYTE = null_mut();
        let mut entries_read = 0u32;
        let mut total_entries = 0u32;
        let status = unsafe {
            NetShareEnum(
                server_ptr,
                1,
                &mut buffer,
                MAX_PREFERRED_LENGTH,
                &mut entries_read,
                &mut total_entries,
                &mut resume,
            )
        };
        let owned = NetApiBuffer(buffer);
        if status != NO_ERROR && status != ERROR_MORE_DATA {
            return Err(FolderSharingError::win32(map_network_error(status), status));
        }
        if !owned.0.is_null() && entries_read > 0 {
            let entries = unsafe {
                slice::from_raw_parts(owned.0 as *const SHARE_INFO_1, entries_read as usize)
            };
            for entry in entries {
                let name = unsafe { wide_ptr_to_string(entry.shi1_netname) };
                let description = unsafe { wide_ptr_to_string(entry.shi1_remark) };
                result.push(RemoteShare {
                    unc_path: format!(r"\\{}\{}", normalized, name),
                    name,
                    description,
                    special: entry.shi1_type & STYPE_SPECIAL != 0,
                    disk_share: entry.shi1_type & STYPE_MASK == STYPE_DISKTREE,
                });
            }
        }
        if status != ERROR_MORE_DATA {
            break;
        }
    }

    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

#[derive(Clone, Debug)]
struct OwnedNetResource {
    remote_name: String,
    local_name: String,
    provider: String,
    display_type: DWORD,
    usage: DWORD,
}

unsafe fn copy_net_resource(resource: &NETRESOURCEW) -> OwnedNetResource {
    OwnedNetResource {
        remote_name: wide_ptr_to_string(resource.lpRemoteName),
        local_name: wide_ptr_to_string(resource.lpLocalName),
        provider: wide_ptr_to_string(resource.lpProvider),
        display_type: resource.dwDisplayType,
        usage: resource.dwUsage,
    }
}

fn enumerate_wnet(
    scope: DWORD,
    parent: Option<&OwnedNetResource>,
) -> Result<Vec<OwnedNetResource>, FolderSharingError> {
    let mut remote_wide = parent.map(|item| wide_null(&item.remote_name));
    let mut provider_wide = parent.map(|item| wide_null(&item.provider));
    let mut parent_resource: NETRESOURCEW = unsafe { zeroed() };
    let parent_ptr = if let Some(parent_value) = parent {
        parent_resource.dwType = RESOURCETYPE_DISK;
        parent_resource.dwDisplayType = parent_value.display_type;
        parent_resource.dwUsage = parent_value.usage;
        parent_resource.lpRemoteName = remote_wide
            .as_mut()
            .map(|value| value.as_mut_ptr())
            .unwrap_or(null_mut());
        parent_resource.lpProvider = provider_wide
            .as_mut()
            .map(|value| value.as_mut_ptr())
            .unwrap_or(null_mut());
        &mut parent_resource
    } else {
        null_mut()
    };

    let mut handle: HANDLE = null_mut();
    let status = unsafe {
        WNetOpenEnumW(
            scope,
            RESOURCETYPE_DISK,
            RESOURCEUSAGE_CONNECTABLE | RESOURCEUSAGE_CONTAINER,
            parent_ptr,
            &mut handle,
        )
    };
    if status != NO_ERROR {
        return Err(FolderSharingError::win32(map_network_error(status), status));
    }
    let handle = WNetEnumHandle(handle);
    let mut resources = Vec::new();

    loop {
        let buffer_words = 32 * 1024 / size_of::<usize>();
        let mut buffer: Vec<usize> = vec![0; buffer_words];
        let mut buffer_size = (buffer.len() * size_of::<usize>()) as u32;
        let mut count = u32::MAX;
        let status = unsafe {
            WNetEnumResourceW(
                handle.0,
                &mut count,
                buffer.as_mut_ptr() as *mut _,
                &mut buffer_size,
            )
        };
        if status == ERROR_NO_MORE_ITEMS {
            break;
        }
        if status != NO_ERROR {
            return Err(FolderSharingError::win32(map_network_error(status), status));
        }
        let entries = unsafe {
            slice::from_raw_parts(buffer.as_ptr() as *const NETRESOURCEW, count as usize)
        };
        for entry in entries {
            resources.push(unsafe { copy_net_resource(entry) });
        }
    }

    Ok(resources)
}

pub fn discover_network_devices() -> Result<Vec<NetworkDevice>, FolderSharingError> {
    let roots = enumerate_wnet(RESOURCE_GLOBALNET, None)
        .or_else(|_| enumerate_wnet(RESOURCE_CONTEXT, None))?;
    let mut pending: Vec<(OwnedNetResource, usize)> = roots
        .into_iter()
        .map(|resource| (resource, 0usize))
        .collect();
    let mut seen_containers = HashSet::new();
    let mut devices: HashMap<String, NetworkDevice> = HashMap::new();

    while let Some((resource, depth)) = pending.pop() {
        if resource.display_type == RESOURCEDISPLAYTYPE_SERVER && !resource.remote_name.is_empty() {
            let host = resource.remote_name.trim_start_matches('\\').to_string();
            devices.entry(host.to_lowercase()).or_insert(NetworkDevice {
                name: host,
                remote_name: resource.remote_name.clone(),
                provider: resource.provider.clone(),
            });
        }
        if depth >= 3 || resource.usage & RESOURCEUSAGE_CONTAINER == 0 {
            continue;
        }
        let key = resource.remote_name.to_lowercase();
        if !seen_containers.insert(key) {
            continue;
        }
        if let Ok(children) = enumerate_wnet(RESOURCE_GLOBALNET, Some(&resource)) {
            for child in children {
                pending.push((child, depth + 1));
            }
        }
    }

    let mut result: Vec<_> = devices.into_values().collect();
    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

fn enumerate_mappings(scope: DWORD) -> Result<Vec<MappedDrive>, FolderSharingError> {
    let resources = enumerate_wnet(scope, None)?;
    Ok(resources
        .into_iter()
        .filter(|entry| {
            !entry.remote_name.is_empty()
                && (entry.display_type == RESOURCEDISPLAYTYPE_SHARE
                    || entry.display_type == RESOURCEDISPLAYTYPE_SHAREADMIN
                    || !entry.local_name.is_empty())
        })
        .map(|entry| MappedDrive {
            local_path: entry.local_name,
            remote_path: entry.remote_name,
            provider: entry.provider,
            persistent: scope == RESOURCE_REMEMBERED,
            connected: scope == RESOURCE_CONNECTED,
        })
        .collect())
}

pub fn list_mapped_drives() -> Result<Vec<MappedDrive>, FolderSharingError> {
    let mut by_key: HashMap<String, MappedDrive> = HashMap::new();
    for item in enumerate_mappings(RESOURCE_REMEMBERED).unwrap_or_default() {
        let key = if item.local_path.is_empty() {
            item.remote_path.to_lowercase()
        } else {
            item.local_path.to_uppercase()
        };
        by_key.insert(key, item);
    }
    for item in enumerate_mappings(RESOURCE_CONNECTED).unwrap_or_default() {
        let key = if item.local_path.is_empty() {
            item.remote_path.to_lowercase()
        } else {
            item.local_path.to_uppercase()
        };
        by_key
            .entry(key)
            .and_modify(|existing| existing.connected = true)
            .or_insert(item);
    }
    let mut result: Vec<_> = by_key.into_values().collect();
    result.sort_by(|a, b| a.local_path.cmp(&b.local_path));
    Ok(result)
}

pub fn open_shared_folder(value: &str) -> Result<(), FolderSharingError> {
    let value = value.trim();
    let path = if value.starts_with(r"\\") || value.to_ascii_lowercase().starts_with("smb://") {
        normalize_unc_path(value)?
    } else {
        let path = Path::new(value);
        if !path.is_absolute() || !path.is_dir() {
            return Err(FolderSharingError::new(
                "invalid_share_path",
                "Folder path must be an existing local directory or UNC share",
            ));
        }
        value.to_string()
    };

    Command::new("explorer.exe")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| FolderSharingError::new("open_path_failed", error.to_string()))
}

pub fn connect_remote(
    mut request: RemoteConnectionRequest,
) -> Result<MappedDrive, FolderSharingError> {
    let remote_path = normalize_unc_path(&request.remote_path)?;
    let local_path = normalize_drive_letter(request.local_path.as_deref())?;
    let mut remote_wide = wide_null(&remote_path);
    let mut local_wide = local_path.as_ref().map(|value| wide_null(value));
    let mut resource: NETRESOURCEW = unsafe { zeroed() };
    resource.dwType = RESOURCETYPE_DISK;
    resource.lpRemoteName = remote_wide.as_mut_ptr();
    resource.lpLocalName = local_wide
        .as_mut()
        .map(|value| value.as_mut_ptr())
        .unwrap_or(null_mut());

    let flags = if request.persistent && local_path.is_some() {
        CONNECT_UPDATE_PROFILE
    } else {
        0
    };
    let mut credential_error = None;
    let status = if request.prompt {
        unsafe {
            WNetAddConnection3W(
                null_mut(),
                &mut resource,
                null(),
                null(),
                flags | CONNECT_INTERACTIVE | CONNECT_PROMPT,
            )
        }
    } else {
        let mut username_wide = request.username.as_ref().map(|value| wide_null(value));
        let mut password_wide = request.password.as_ref().map(|value| wide_null(value));
        let status = unsafe {
            WNetAddConnection2W(
                &mut resource,
                password_wide
                    .as_ref()
                    .map(|value| value.as_ptr())
                    .unwrap_or(null()),
                username_wide
                    .as_ref()
                    .map(|value| value.as_ptr())
                    .unwrap_or(null()),
                flags,
            )
        };
        if status == NO_ERROR && request.save_credentials {
            if let (Some(username), Some(password)) =
                (request.username.as_deref(), request.password.as_deref())
            {
                if let Err(error) = save_windows_credential(&remote_path, username, password) {
                    credential_error = Some(error);
                }
            }
        }
        if let Some(value) = password_wide.as_mut() {
            value.zeroize();
        }
        if let Some(value) = username_wide.as_mut() {
            value.zeroize();
        }
        status
    };

    if let Some(password) = request.password.as_mut() {
        password.zeroize();
    }
    if let Some(error) = credential_error {
        let wide = wide_null(&local_path.clone().unwrap_or_else(|| remote_path.clone()));
        unsafe {
            WNetCancelConnection2W(wide.as_ptr(), flags, TRUE);
        }
        return Err(error);
    }
    if status != NO_ERROR {
        return Err(FolderSharingError::win32(map_network_error(status), status));
    }

    Ok(MappedDrive {
        local_path: local_path.unwrap_or_default(),
        remote_path,
        provider: "Microsoft Windows Network".into(),
        persistent: request.persistent,
        connected: true,
    })
}

pub fn disconnect_remote(
    name: &str,
    remote_path: Option<&str>,
    forget_persistent: bool,
    force: bool,
    forget_credentials: bool,
) -> Result<(), FolderSharingError> {
    let normalized = if name.len() == 2 && name.ends_with(':') {
        name.to_uppercase()
    } else {
        normalize_unc_path(name)?
    };
    let credential_host = if forget_credentials {
        match remote_path {
            Some(path) => Some(host_from_unc(path)?),
            None => host_from_unc(&normalized).ok(),
        }
    } else {
        None
    };
    let wide = wide_null(&normalized);
    let status = unsafe {
        WNetCancelConnection2W(
            wide.as_ptr(),
            if forget_persistent {
                CONNECT_UPDATE_PROFILE
            } else {
                0
            },
            if force { TRUE } else { FALSE },
        )
    };
    if status != NO_ERROR {
        return Err(FolderSharingError::win32(map_network_error(status), status));
    }
    if let Some(host) = credential_host {
        delete_windows_credential(&host);
    }
    Ok(())
}

pub fn disconnect_server(
    server: &str,
    force: bool,
    forget_credentials: bool,
) -> Result<u32, FolderSharingError> {
    let host = normalize_server(server)?;
    let mut disconnected = 0u32;
    let mut first_error = None;
    let mut seen = HashSet::new();
    for mapping in list_mapped_drives()? {
        let Ok(mapping_host) = host_from_unc(&mapping.remote_path) else {
            continue;
        };
        if !mapping_host.eq_ignore_ascii_case(&host) {
            continue;
        }
        let remote_path = mapping.remote_path;
        let name = if mapping.local_path.is_empty() {
            remote_path.clone()
        } else {
            mapping.local_path
        };
        if !seen.insert(name.to_lowercase()) {
            continue;
        }
        match disconnect_remote(&name, Some(&remote_path), true, force, false) {
            Ok(()) => disconnected += 1,
            Err(error) if error.code == "not_connected" => {}
            Err(error) => {
                first_error.get_or_insert(error);
            }
        }
    }
    if forget_credentials {
        delete_windows_credential(&host);
    }
    if disconnected == 0 {
        return Err(first_error.unwrap_or_else(|| {
            FolderSharingError::new(
                "conflicting_connection_not_found",
                "No removable connection to this server was found",
            )
        }));
    }
    Ok(disconnected)
}

fn save_windows_credential(
    remote_path: &str,
    username: &str,
    password: &str,
) -> Result<(), FolderSharingError> {
    let host = host_from_unc(remote_path)?;
    let mut target = wide_null(&host);
    let mut user = wide_null(username);
    let mut password_wide: Vec<u16> = OsStr::new(password).encode_wide().collect();
    let mut credential: CREDENTIALW = unsafe { zeroed() };
    credential.Type = CRED_TYPE_DOMAIN_PASSWORD;
    credential.TargetName = target.as_mut_ptr();
    credential.UserName = user.as_mut_ptr();
    credential.CredentialBlob = password_wide.as_mut_ptr() as *mut u8;
    credential.CredentialBlobSize = (password_wide.len() * size_of::<u16>()) as u32;
    credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
    let ok = unsafe { CredWriteW(&mut credential, 0) };
    password_wide.zeroize();
    user.zeroize();
    target.zeroize();
    if ok == FALSE {
        let code = unsafe { winapi::um::errhandlingapi::GetLastError() };
        return Err(FolderSharingError::win32("credential_save_failed", code));
    }
    Ok(())
}

fn delete_windows_credential(host: &str) {
    let target = wide_null(host);
    unsafe {
        CredDeleteW(target.as_ptr(), CRED_TYPE_DOMAIN_PASSWORD, 0);
    }
}

pub fn normalize_server(value: &str) -> Result<String, FolderSharingError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(FolderSharingError::new(
            "invalid_server",
            "Server is required",
        ));
    }
    let normalized = if trimmed.to_ascii_lowercase().starts_with("smb://") {
        trimmed[6..].split('/').next().unwrap_or_default()
    } else {
        trimmed
            .trim_start_matches('\\')
            .split('\\')
            .next()
            .unwrap_or_default()
    }
    .trim();
    if normalized.is_empty()
        || normalized.len() > 255
        || normalized
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\' | ' '))
    {
        return Err(FolderSharingError::new(
            "invalid_server",
            "Invalid server name",
        ));
    }
    Ok(normalized.to_string())
}

pub fn normalize_unc_path(value: &str) -> Result<String, FolderSharingError> {
    let trimmed = value.trim();
    let unc = if trimmed.to_ascii_lowercase().starts_with("smb://") {
        format!(r"\\{}", trimmed[6..].replace('/', r"\"))
    } else if trimmed.starts_with(r"\\") {
        trimmed.to_string()
    } else {
        return Err(FolderSharingError::new(
            "invalid_unc_path",
            "Use a UNC or smb:// path",
        ));
    };
    let parts: Vec<_> = unc
        .trim_start_matches('\\')
        .split('\\')
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() < 2
        || parts.iter().any(|part| {
            matches!(*part, "." | "..")
                || part.chars().any(|c| {
                    c.is_control() || matches!(c, '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
                })
        })
    {
        return Err(FolderSharingError::new(
            "invalid_unc_path",
            "Invalid UNC path",
        ));
    }
    Ok(format!(r"\\{}", parts.join(r"\")))
}

pub fn host_from_unc(value: &str) -> Result<String, FolderSharingError> {
    Ok(normalize_unc_path(value)?
        .trim_start_matches('\\')
        .split('\\')
        .next()
        .unwrap_or_default()
        .to_string())
}

fn normalize_drive_letter(value: Option<&str>) -> Result<Option<String>, FolderSharingError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim().to_uppercase();
    let bytes = value.as_bytes();
    if bytes.len() != 2 || !bytes[0].is_ascii_alphabetic() || bytes[1] != b':' {
        return Err(FolderSharingError::new(
            "invalid_drive",
            "Invalid drive letter",
        ));
    }
    if bytes[0] < b'D' {
        return Err(FolderSharingError::new(
            "invalid_drive",
            "Drive letters A through C are reserved",
        ));
    }
    Ok(Some(value))
}

fn map_network_error(code: u32) -> &'static str {
    match code {
        ERROR_CANCELLED => "user_cancelled",
        ERROR_SESSION_CREDENTIAL_CONFLICT => "credential_conflict",
        5 => "access_denied",
        53 | 67 | 1231 => "host_unreachable",
        85 | 1202 => "drive_in_use",
        86 | 1244 | 1317 | 1326 | 1327 | 1328 | 1329 | 1330 | 1331 => "bad_credentials",
        1260 | 1265 | 1272 | 1385 => "remote_policy_incompatible",
        2250 => "not_connected",
        2401 | 2404 => "connection_has_open_files",
        _ => "network_operation_failed",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_unc_and_smb_paths() {
        assert_eq!(
            normalize_unc_path(r"\\server\share\folder").unwrap(),
            r"\\server\share\folder"
        );
        assert_eq!(
            normalize_unc_path("smb://server/share/folder").unwrap(),
            r"\\server\share\folder"
        );
    }

    #[test]
    fn rejects_incomplete_unc_paths() {
        assert!(normalize_unc_path(r"\\server").is_err());
        assert!(normalize_unc_path("server/share").is_err());
        assert!(normalize_unc_path(r"\\server\share\..\admin$").is_err());
        assert!(normalize_unc_path(r"\\.\pipe").is_err());
    }

    #[test]
    fn extracts_server_names() {
        assert_eq!(normalize_server(r"\\SERVER\share").unwrap(), "SERVER");
        assert_eq!(normalize_server("smb://nas/media").unwrap(), "nas");
        assert_eq!(host_from_unc(r"\\nas\media").unwrap(), "nas");
    }

    #[test]
    fn maps_actionable_network_errors() {
        assert_eq!(
            map_network_error(ERROR_SESSION_CREDENTIAL_CONFLICT),
            "credential_conflict"
        );
        assert_eq!(map_network_error(1326), "bad_credentials");
        assert_eq!(map_network_error(1260), "remote_policy_incompatible");
        assert_eq!(map_network_error(85), "drive_in_use");
    }

    #[test]
    fn enumerates_local_shares_without_elevation() {
        let shares = list_local_shares().expect("NetShareEnum level 2 should be available locally");
        assert!(!shares.is_empty());
        assert!(shares.iter().all(|share| {
            !share.name.is_empty()
                && share.unc_path.starts_with(r"\\")
                && share.unc_path.ends_with(&share.name)
        }));
    }
}
