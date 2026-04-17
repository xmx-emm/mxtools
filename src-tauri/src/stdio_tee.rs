//! Windows 下重定向 stdout/stderr,使 println!/eprintln! 同时输出到控制台并写入日志文件

#[cfg(windows)]
mod imp {
  use std::fs::File;
  use std::io::{Read, Write};
  use std::os::windows::io::{FromRawHandle, RawHandle};
  use std::sync::Mutex;
  use std::thread;

  use winapi::um::handleapi::INVALID_HANDLE_VALUE;
  use winapi::um::namedpipeapi::CreatePipe;
  use winapi::um::processenv::{GetStdHandle, SetStdHandle};
  use winapi::um::winbase::{STD_ERROR_HANDLE, STD_OUTPUT_HANDLE};

  static TEE_INITIALIZED: Mutex<bool> = Mutex::new(false);

    /// 是否已启用 stdio 重定向(用于避免 log 宏重复写文件)
    pub fn is_active() -> bool {
        *TEE_INITIALIZED.lock().unwrap()
    }

    fn is_valid_handle(h: winapi::shared::ntdef::HANDLE) -> bool {
        !h.is_null() && h != INVALID_HANDLE_VALUE
    }

    type TruncateFn = fn(&std::path::Path);

    /// 从 pipe 读取并写入控制台和文件(每次写入前通过 `get_path` 解析路径,以支持按日轮转)
    fn tee_thread<F>(
        mut pipe_read: File,
        mut console_write: File,
        get_path: std::sync::Arc<F>,
        maybe_truncate: TruncateFn,
    ) where
        F: Fn() -> std::path::PathBuf + Send + Sync + 'static,
    {
        let mut buf = [0u8; 4096];
        loop {
            match pipe_read.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = &buf[..n];
                    let _ = console_write.write_all(data);
                    let _ = console_write.flush();
                    let log_path = get_path();
                    maybe_truncate(&log_path);
                    if let Ok(mut file) = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(&log_path)
                    {
                        let _ = file.write_all(data);
                        let _ = file.flush();
                    }
                }
                Err(_) => break,
            }
        }
    }

    /// 初始化 stdio 重定向：所有 println!/eprintln! 将同时输出到控制台并追加到 backend 日志文件
    pub fn init<F>(get_path: std::sync::Arc<F>, maybe_truncate: TruncateFn)
    where
        F: Fn() -> std::path::PathBuf + Send + Sync + 'static,
    {
        let mut guard = TEE_INITIALIZED.lock().unwrap();
        if *guard {
            return;
        }

        unsafe {
            // stdout
            let h_stdout = GetStdHandle(STD_OUTPUT_HANDLE);
            if is_valid_handle(h_stdout) {
                let mut h_read: winapi::shared::ntdef::HANDLE = std::mem::zeroed();
                let mut h_write: winapi::shared::ntdef::HANDLE = std::mem::zeroed();
                if CreatePipe(&mut h_read, &mut h_write, std::ptr::null_mut(), 0) != 0 {
                    if SetStdHandle(STD_OUTPUT_HANDLE, h_write) != 0 {
                        let pipe_read = File::from_raw_handle(h_read as RawHandle);
                        let console_write = File::from_raw_handle(h_stdout as RawHandle);
                        let gp = get_path.clone();
                        thread::spawn(move || {
                            tee_thread(pipe_read, console_write, gp, maybe_truncate)
                        });
                    }
                }
            }

            // stderr
            let h_stderr = GetStdHandle(STD_ERROR_HANDLE);
            if is_valid_handle(h_stderr) {
                let mut h_read: winapi::shared::ntdef::HANDLE = std::mem::zeroed();
                let mut h_write: winapi::shared::ntdef::HANDLE = std::mem::zeroed();
                if CreatePipe(&mut h_read, &mut h_write, std::ptr::null_mut(), 0) != 0 {
                    if SetStdHandle(STD_ERROR_HANDLE, h_write) != 0 {
                        let pipe_read = File::from_raw_handle(h_read as RawHandle);
                        let console_write = File::from_raw_handle(h_stderr as RawHandle);
                        let gp = get_path.clone();
                        thread::spawn(move || {
                            tee_thread(pipe_read, console_write, gp, maybe_truncate)
                        });
                    }
                }
            }
        }

        *guard = true;
    }
}

#[cfg(not(windows))]
mod imp {
  pub fn init<F>(_get_path: std::sync::Arc<F>, _maybe_truncate: fn(&std::path::Path))
  where
    F: Fn() -> std::path::PathBuf + Send + Sync + 'static,
  {
        // 非 Windows 平台暂不实现
    }
}

pub use imp::init;

#[cfg(windows)]
pub use imp::is_active;

#[cfg(not(windows))]
pub fn is_active() -> bool {
    false
}
