use super::*;

fn successful_transitions(initial: u32, targets: &[u32]) -> (Vec<FakeReply>, u32) {
    let mut replies = vec![FakeReply::Status(2, rate_to_code(initial).unwrap())];
    let mut current = initial;
    for target in targets {
        replies.extend([
            FakeReply::Status(2, rate_to_code(current).unwrap()),
            FakeReply::Status(2, rate_to_code(*target).unwrap()),
            FakeReply::Status(2, rate_to_code(*target).unwrap()),
        ]);
        current = *target;
    }
    (replies, current)
}

fn append_restore(replies: &mut Vec<FakeReply>, current: u32, original: u32) {
    replies.extend([
        FakeReply::Status(2, rate_to_code(current).unwrap()),
        FakeReply::Status(2, rate_to_code(original).unwrap()),
        FakeReply::Status(2, rate_to_code(original).unwrap()),
    ]);
}

#[test]
fn verification_from_8000_checks_lower_rates_and_restores_8000() {
    let lower_rates = [125, 250, 500, 1000, 2000, 4000];
    let (mut replies, current) = successful_transitions(8000, &lower_rates);
    append_restore(&mut replies, current, 8000);
    let mut transport = FakeTransport::new(replies);
    let mut protocol = ProtocolState::default();
    let mut runtime = DeviceRuntime::default();
    let recorder = MemoryRecorder::default();

    let result = verify_capabilities_with_transport(
        &mut transport,
        &mut protocol,
        &mut runtime,
        &device("cap-8k"),
        &recorder,
    );

    assert!(result.complete);
    assert_eq!(result.supported_rates_hz, SUPPORTED_RATES);
    assert_eq!(result.highest_confirmed_rate_hz, Some(8000));
    assert_eq!(result.restored_rate_hz, Some(8000));
    assert_eq!(runtime.current_rate_hz, Some(8000));
    assert!(!runtime.faulted);
}

#[test]
fn explicit_unsupported_upper_rate_stops_higher_checks_and_restores() {
    let confirmed = [125, 250, 500, 2000];
    let (mut replies, current) = successful_transitions(1000, &confirmed);
    replies.extend([
        FakeReply::Status(2, rate_to_code(current).unwrap()),
        FakeReply::Status(7, rate_to_code(4000).unwrap()),
    ]);
    append_restore(&mut replies, current, 1000);
    let mut transport = FakeTransport::new(replies);
    let mut protocol = ProtocolState::default();
    let mut runtime = DeviceRuntime::default();
    let recorder = MemoryRecorder::default();

    let result = verify_capabilities_with_transport(
        &mut transport,
        &mut protocol,
        &mut runtime,
        &device("cap-limit"),
        &recorder,
    );

    assert!(result.complete);
    assert_eq!(result.restored_rate_hz, Some(1000));
    assert_eq!(result.supported_rates_hz, vec![125, 250, 500, 1000, 2000]);
    assert_eq!(
        result.stopped_reason.as_deref(),
        Some("razer_polling.target_unsupported")
    );
    assert!(!transport.requests.iter().any(|packet| {
        packet[8] == COMMAND_SET_POLLING_RATE && packet[10] == rate_to_code(8000).unwrap()
    }));
}

#[test]
fn ambiguous_capability_response_stops_without_another_write() {
    let mut transport = FakeTransport::new([
        FakeReply::Status(2, rate_to_code(1000).unwrap()),
        FakeReply::Status(2, rate_to_code(1000).unwrap()),
        FakeReply::Status(2, rate_to_code(125).unwrap()),
        FakeReply::Error("get_feature_failed"),
    ]);
    let mut protocol = ProtocolState::default();
    let mut runtime = DeviceRuntime::default();
    let recorder = MemoryRecorder::default();

    let result = verify_capabilities_with_transport(
        &mut transport,
        &mut protocol,
        &mut runtime,
        &device("cap-ambiguous"),
        &recorder,
    );

    assert!(!result.complete);
    assert!(result.faulted);
    assert!(result.possibly_changed);
    assert_eq!(
        transport
            .requests
            .iter()
            .filter(|packet| packet[8] == COMMAND_SET_POLLING_RATE)
            .count(),
        1
    );
}
