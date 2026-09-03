/// Requires Steam to be running with CEF debugging (`steam.exe -cef-enable-debugging`).
/// Manual command: `cargo test --lib cef_live_probe -- --ignored --nocapture`.
#[test]
#[ignore]
fn cef_live_probe() {
    tauri::async_runtime::block_on(async {
        let targets = list_targets(8080).await.expect("list CEF targets");
        let shared = targets
            .iter()
            .find(|target| target.title == "SharedJSContext")
            .expect("find SharedJSContext");
        let mut page = CefPage::connect(shared.ws_url.as_deref().unwrap())
            .await
            .expect("connect CEF page");
        let value = page
            .evaluate("(() => typeof SteamClient !== 'undefined')()")
            .await
            .expect("evaluate Steam probe");
        assert_eq!(value, serde_json::Value::Bool(true));
    });
}
