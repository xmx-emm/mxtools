//! Native cursor helpers used by drag-adjustable controls.

use crate::ipc_error::IpcResult;

#[tauri::command]
#[cfg(windows)]
pub fn get_cursor_position() -> IpcResult<(i32, i32)> {
    use crate::ipc_error::IpcError;
    use std::mem::zeroed;
    use winapi::shared::windef::POINT;
    use winapi::um::winuser::GetCursorPos;

    // SAFETY: GetCursorPos initializes the provided POINT on success.
    let mut point: POINT = unsafe { zeroed() };
    if unsafe { GetCursorPos(&mut point) } != 0 {
        Ok((point.x, point.y))
    } else {
        Err(IpcError::new(
            "cursor.capture_failed",
            std::io::Error::last_os_error().to_string(),
        ))
    }
}

#[tauri::command]
#[cfg(not(windows))]
pub fn get_cursor_position() -> IpcResult<(i32, i32)> {
    Err(crate::ipc_error::IpcError::new(
        "cursor.capture_unavailable",
        "Native cursor capture is only available on Windows",
    ))
}

#[tauri::command]
#[cfg(windows)]
pub fn restore_cursor_position(x: i32, y: i32) -> IpcResult<()> {
    use crate::ipc_error::IpcError;
    use winapi::um::winuser::SetCursorPos;

    // SAFETY: SetCursorPos accepts signed screen coordinates for multi-monitor setups.
    if unsafe { SetCursorPos(x, y) } != 0 {
        Ok(())
    } else {
        Err(IpcError::new(
            "cursor.restore_failed",
            std::io::Error::last_os_error().to_string(),
        ))
    }
}

#[tauri::command]
#[cfg(not(windows))]
pub fn restore_cursor_position(_x: i32, _y: i32) -> IpcResult<()> {
    Ok(())
}
