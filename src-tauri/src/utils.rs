use std::time::Duration;
use tokio::time;

static WAIT_MILLIS: u64 = 200; //等待毫秒数，避免数据刷新问题

pub async fn await_time() {
    time::sleep(Duration::from_millis(WAIT_MILLIS)).await;
}

/// 输入文件夹路径分类,备份注册表及日志类的目录
pub static OUTPUT_FOLDER_CATEGORIZE: &str = "mxtools";

/// 单个日志文件最大大小（字节），超过时保留后半部分
pub const MAX_LOG_FILE_SIZE: u64 = 500 * 1024; // 500KB