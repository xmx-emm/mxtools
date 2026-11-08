use super::is_valid_benchmark_host;

#[test]
fn accepts_host_names_and_ip_literals() {
    for host in ["1.1.1.1", "example.com", "my_host-1", "2606:4700::1111"] {
        assert!(is_valid_benchmark_host(host), "{host}");
    }
}

#[test]
fn rejects_values_ping_would_parse_as_switches() {
    for host in ["", "-t", "-l65500", "/t", "a b", "host;calc", &"a".repeat(254)] {
        assert!(!is_valid_benchmark_host(host), "{host}");
    }
}
