use crate::ipc_error::{IpcError, IpcResult};

/// Read the icon from an existing local executable; never launch it.
#[tauri::command]
pub async fn read_game_executable_icon(path: String) -> IpcResult<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || extract_icon(&path))
        .await
        .map_err(|error| IpcError::operation_failed("game_icon", error.to_string()))
}

#[cfg(windows)]
fn local_drive_root(path: &std::path::Path) -> Option<std::path::PathBuf> {
    use std::path::{Component, Prefix};

    let mut components = path.components();
    let drive = match components.next()? {
        Component::Prefix(prefix) => match prefix.kind() {
            Prefix::Disk(drive) => drive,
            _ => return None,
        },
        _ => return None,
    };
    if components.next() != Some(Component::RootDir)
        || components.any(|part| matches!(part, Component::ParentDir | Component::CurDir))
    {
        return None;
    }
    Some(std::path::PathBuf::from(format!("{}:\\", drive as char)))
}

#[cfg(windows)]
fn plain_resolved_drive_path(path: &std::path::Path) -> Option<std::path::PathBuf> {
    use std::path::{Component, Prefix};

    let mut components = path.components();
    let drive = match components.next()? {
        Component::Prefix(prefix) => match prefix.kind() {
            Prefix::Disk(drive) | Prefix::VerbatimDisk(drive) => drive,
            _ => return None,
        },
        _ => return None,
    };
    if components.next() != Some(Component::RootDir) {
        return None;
    }
    let mut plain = std::path::PathBuf::from(format!("{}:\\", drive as char));
    for part in components {
        match part {
            Component::Normal(name) => plain.push(name),
            _ => return None,
        }
    }
    Some(plain)
}

#[cfg(windows)]
fn local_executable_path(path: &str) -> Option<std::path::PathBuf> {
    use std::os::windows::{ffi::OsStrExt, fs::MetadataExt};
    use winapi::um::{
        fileapi::GetDriveTypeW,
        winbase::{DRIVE_CDROM, DRIVE_FIXED, DRIVE_RAMDISK, DRIVE_REMOVABLE},
    };

    if path.contains('\0') {
        return None;
    }
    let candidate = std::path::Path::new(path);
    let root = local_drive_root(candidate)?;
    if !candidate
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
    {
        return None;
    }
    let root_wide: Vec<u16> = root.as_os_str().encode_wide().chain(Some(0)).collect();
    if !matches!(
        unsafe { GetDriveTypeW(root_wide.as_ptr()) },
        DRIVE_FIXED | DRIVE_REMOVABLE | DRIVE_CDROM | DRIVE_RAMDISK
    ) {
        return None;
    }
    let mut current = root;
    for part in candidate.components().skip(2) {
        current.push(part.as_os_str());
        let metadata = std::fs::symlink_metadata(&current).ok()?;
        if metadata.file_attributes() & 0x400 != 0 {
            return None;
        }
    }
    if !current.is_file() {
        return None;
    }
    // The path has been checked component by component before resolution, so
    // a junction cannot redirect icon extraction to a remote share.
    let resolved = std::fs::canonicalize(&current).ok()?;
    plain_resolved_drive_path(&resolved)
}

#[cfg(windows)]
fn extract_icon(path: &str) -> Option<String> {
    use base64::Engine;
    use std::{io::Cursor, mem::zeroed, os::windows::ffi::OsStrExt, ptr::null_mut};
    use winapi::shared::winerror::RPC_E_CHANGED_MODE;
    use winapi::um::shellapi::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use winapi::um::wingdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GdiFlush, SelectObject,
        BITMAPINFO, BI_RGB, DIB_RGB_COLORS,
    };
    use winapi::um::winuser::{DestroyIcon, DrawIconEx};
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    const DI_NORMAL: u32 = 3;

    let file = local_executable_path(path)?;
    let wide: Vec<u16> = file.as_os_str().encode_wide().chain(Some(0)).collect();
    // SHGetFileInfo requires COM on the calling background thread:
    // https://learn.microsoft.com/windows/win32/api/shellapi/nf-shellapi-shgetfileinfow
    struct ComGuard(bool);
    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() };
            }
        }
    }
    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() && initialized.0 != RPC_E_CHANGED_MODE {
        return None;
    }
    let _com = ComGuard(initialized.is_ok());
    let mut pixels = vec![0u8; 32 * 32 * 4];
    unsafe {
        let mut info: SHFILEINFOW = zeroed();
        if SHGetFileInfoW(
            wide.as_ptr(),
            0,
            &mut info,
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        ) == 0
            || info.hIcon.is_null()
        {
            return None;
        }
        let dc = CreateCompatibleDC(null_mut());
        if dc.is_null() {
            DestroyIcon(info.hIcon);
            return None;
        }
        let mut bitmap_info: BITMAPINFO = zeroed();
        bitmap_info.bmiHeader.biSize = std::mem::size_of_val(&bitmap_info.bmiHeader) as u32;
        bitmap_info.bmiHeader.biWidth = 32;
        bitmap_info.bmiHeader.biHeight = -32;
        bitmap_info.bmiHeader.biPlanes = 1;
        bitmap_info.bmiHeader.biBitCount = 32;
        bitmap_info.bmiHeader.biCompression = BI_RGB;
        let mut bits = null_mut();
        let bitmap = CreateDIBSection(dc, &bitmap_info, DIB_RGB_COLORS, &mut bits, null_mut(), 0);
        if bitmap.is_null() || bits.is_null() {
            if !bitmap.is_null() {
                DeleteObject(bitmap as _);
            }
            DeleteDC(dc);
            DestroyIcon(info.hIcon);
            return None;
        }
        std::ptr::write_bytes(bits as *mut u8, 0, pixels.len());
        let previous = SelectObject(dc, bitmap as _);
        if previous.is_null() || previous as isize == -1 {
            DeleteObject(bitmap as _);
            DeleteDC(dc);
            DestroyIcon(info.hIcon);
            return None;
        }
        let drawn = DrawIconEx(dc, 0, 0, info.hIcon, 32, 32, 0, null_mut(), DI_NORMAL);
        GdiFlush();
        std::ptr::copy_nonoverlapping(bits as *const u8, pixels.as_mut_ptr(), pixels.len());
        let restored = SelectObject(dc, previous);
        if restored.is_null() || restored as isize == -1 {
            DeleteDC(dc);
            DeleteObject(bitmap as _);
            DestroyIcon(info.hIcon);
            return None;
        }
        DeleteObject(bitmap as _);
        DeleteDC(dc);
        DestroyIcon(info.hIcon);
        if drawn == 0 {
            return None;
        }
    }
    let has_alpha = pixels.as_chunks::<4>().0.iter().any(|pixel| pixel[3] != 0);
    for pixel in pixels.as_chunks_mut::<4>().0 {
        pixel.swap(0, 2);
        if !has_alpha {
            pixel[3] = 255;
        }
        // Windows icons use premultiplied alpha; PNG stores straight alpha.
        if pixel[3] > 0 && pixel[3] < 255 {
            for channel in 0..3 {
                pixel[channel] = ((pixel[channel] as u32 * 255) / pixel[3] as u32).min(255) as u8;
            }
        }
    }
    let image = image::RgbaImage::from_raw(32, 32, pixels)?;
    let mut png = Cursor::new(Vec::new());
    image.write_to(&mut png, image::ImageFormat::Png).ok()?;
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png.into_inner())
    ))
}

#[cfg(not(windows))]
fn extract_icon(_path: &str) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/game_icon.rs"
    ));
}
