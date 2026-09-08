use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use windows::core::{Interface, BSTR};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, IDispatch, IServiceProvider,
    CLSCTX_LOCAL_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Shell::{
    IShellBrowser, IShellDispatch2, IShellFolderViewDual, IShellWindows, SID_STopLevelBrowser,
    ShellWindows, CSIDL_DESKTOP, SVGIO_BACKGROUND, SWC_DESKTOP, SWFO_NEEDDISPATCH,
};

struct ComApartment;

impl ComApartment {
    fn initialize() -> windows::core::Result<Self> {
        // This apartment belongs to a dedicated thread; no COM interfaces leave it.
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE).ok()? };
        Ok(Self)
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

struct LaunchArguments {
    executable: BSTR,
    arguments: VARIANT,
    directory: VARIANT,
    operation: VARIANT,
    show: VARIANT,
}

fn launch_arguments(launcher: &Path) -> Result<LaunchArguments, String> {
    if !launcher.is_absolute() {
        return Err("apex.milesDlEa.eaNotFound".into());
    }
    let directory = launcher.parent().ok_or("apex.milesDlEa.eaNotFound")?;
    let path_bstr =
        |path: &Path| BSTR::from_wide(&path.as_os_str().encode_wide().collect::<Vec<_>>());
    Ok(LaunchArguments {
        executable: path_bstr(launcher),
        arguments: VARIANT::from("origin://launchgame/194908"),
        directory: VARIANT::from(path_bstr(directory)),
        operation: VARIANT::from("open"),
        show: VARIANT::from(7_i32),
    })
}

fn desktop_shell() -> windows::core::Result<IShellDispatch2> {
    // Use Explorer's existing desktop, as documented by Microsoft:
    // https://devblogs.microsoft.com/oldnewthing/20131118-00/?p=2643
    // A newly created Shell.Application object can inherit the dev process's job
    // and reproduce EA's CreateProcess access-denied failure.
    unsafe {
        let windows: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_LOCAL_SERVER)?;
        let mut hwnd = 0;
        let desktop = windows.FindWindowSW(
            &VARIANT::from(CSIDL_DESKTOP as i32),
            &VARIANT::default(),
            SWC_DESKTOP,
            &mut hwnd,
            SWFO_NEEDDISPATCH,
        )?;
        let provider: IServiceProvider = desktop.cast()?;
        let browser: IShellBrowser = provider.QueryService(&SID_STopLevelBrowser)?;
        let view = browser.QueryActiveShellView()?;
        // The view accepts IID_IDispatch here; request the dual interface via QI.
        let dispatch: IDispatch = view.GetItemObject(SVGIO_BACKGROUND)?;
        let folder: IShellFolderViewDual = dispatch.cast()?;
        folder.Application()?.cast()
    }
}

pub(super) fn launch(launcher: PathBuf) -> Result<(), String> {
    std::thread::Builder::new()
        .name("ea-launch".into())
        .spawn(move || {
            let _apartment = ComApartment::initialize().map_err(|error| error.to_string())?;
            let args = launch_arguments(&launcher)?;
            let shell = desktop_shell().map_err(|error| error.to_string())?;
            // Pass paths and parameters as separate COM values, without a script
            // interpreter. All interfaces and VARIANTs drop before CoUninitialize.
            unsafe {
                shell.ShellExecute(
                    &args.executable,
                    &args.arguments,
                    &args.directory,
                    &args.operation,
                    &args.show,
                )
            }
            .map_err(|error| error.to_string())
        })
        .map_err(|error| error.to_string())?
        .join()
        .map_err(|_| "EA desktop launch thread failed".to_string())?
}

#[cfg(test)]
include!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../tests/rust/src-tauri/game/apex_launch_ea.rs"
));
