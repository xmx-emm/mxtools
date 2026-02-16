use std::time::Duration;
use tokio::time;

static WAIT_MILLIS: u64 = 200; //等待毫秒数，避免数据刷新问题

pub async fn await_time() {
    time::sleep(Duration::from_millis(WAIT_MILLIS)).await;
}
