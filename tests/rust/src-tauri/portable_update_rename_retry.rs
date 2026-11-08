use super::{retry_transient, RENAME_ATTEMPTS};
use std::io::{Error, ErrorKind};
use std::time::Duration;

#[test]
fn retries_sharing_violations_until_the_rename_succeeds() {
    let mut calls = 0;
    let mut sleeps = Vec::new();
    let result = retry_transient(
        || {
            calls += 1;
            if calls < 3 {
                Err(Error::from_raw_os_error(32))
            } else {
                Ok(())
            }
        },
        |delay| sleeps.push(delay),
    );
    assert!(result.is_ok());
    assert_eq!(calls, 3);
    assert_eq!(sleeps, [Duration::from_millis(50), Duration::from_millis(100)]);
}

#[test]
fn stops_after_the_attempt_limit() {
    let mut calls = 0;
    let result = retry_transient(
        || {
            calls += 1;
            Err(Error::from(ErrorKind::PermissionDenied))
        },
        |_| {},
    );
    assert!(result.is_err());
    assert_eq!(calls, RENAME_ATTEMPTS);
}

#[test]
fn does_not_retry_permanent_errors() {
    let mut calls = 0;
    let result = retry_transient(
        || {
            calls += 1;
            Err(Error::from(ErrorKind::NotFound))
        },
        |_| {},
    );
    assert_eq!(result.unwrap_err().kind(), ErrorKind::NotFound);
    assert_eq!(calls, 1);
}
