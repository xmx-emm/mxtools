#[test]
fn cef_falls_back_to_ipv6_when_ipv4_belongs_to_another_service() {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    let ipv4 = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = ipv4.local_addr().unwrap().port();
    let ipv6 = TcpListener::bind((std::net::Ipv6Addr::LOCALHOST, port)).unwrap();
    let serve = |listener: TcpListener, status: &'static str, body: String| {
        std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = [0; 4096];
            let received = socket.read(&mut request).unwrap();
            assert!(received > 0, "Expected an HTTP discovery request");
            write!(
                socket,
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
        })
    };
    let other = serve(ipv4, "404 Not Found", "Cannot GET /json".into());
    let steam = serve(
        ipv6,
        "200 OK",
        format!(
            r#"[{{"id":"test","type":"page","title":"SharedJSContext","webSocketDebuggerUrl":"ws://localhost:{port}/devtools/page/test"}}]"#
        ),
    );
    tauri::async_runtime::block_on(async {
        let targets = list_targets(port).await.unwrap();
        assert_eq!(targets[0].title, "SharedJSContext");
        assert_eq!(
            targets[0].ws_url.as_deref(),
            Some(format!("ws://[::1]:{port}/devtools/page/test").as_str())
        );
    });
    other.join().unwrap();
    steam.join().unwrap();
}
