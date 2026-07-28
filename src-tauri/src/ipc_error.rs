use serde::Serialize;
use serde_json::{Map, Value};
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Map<String, Value>>,
}

impl IpcError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: normalize_code(&code.into()),
            message: message.into(),
            details: None,
        }
    }

    pub fn operation_failed(domain: &str, message: impl Into<String>) -> Self {
        Self::from_message(domain, message)
    }

    pub fn from_message(domain: &str, message: impl Into<String>) -> Self {
        let message = message.into();
        let trimmed = message.trim();
        let (head, detail) = trimmed
            .split_once(':')
            .map(|(head, detail)| (head.trim().to_string(), Some(detail.trim().to_string())))
            .unwrap_or_else(|| (trimmed.to_string(), None));
        let code = legacy_key_code(domain, &head)
            .unwrap_or_else(|| format!("{}.operation_failed", normalize_segment(domain)));
        let mut error = Self::new(code, message);
        if let Some(detail) = detail.filter(|value| !value.is_empty()) {
            error = error.with_detail("detail", detail);
        }
        error
    }

    pub fn with_detail(mut self, key: impl Into<String>, value: impl Into<Value>) -> Self {
        self.details
            .get_or_insert_with(Map::new)
            .insert(key.into(), value.into());
        self
    }
}

impl Display for IpcError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for IpcError {}

impl From<String> for IpcError {
    fn from(value: String) -> Self {
        Self::operation_failed("common", value)
    }
}

impl From<&str> for IpcError {
    fn from(value: &str) -> Self {
        Self::operation_failed("common", value)
    }
}

impl From<std::io::Error> for IpcError {
    fn from(value: std::io::Error) -> Self {
        Self::new("common.io_error", value.to_string()).with_detail(
            "osCode",
            value.raw_os_error().map(Value::from).unwrap_or(Value::Null),
        )
    }
}

pub type IpcResult<T> = Result<T, IpcError>;

fn legacy_key_code(domain: &str, value: &str) -> Option<String> {
    if value.is_empty()
        || !value.contains('.')
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '.'
        })
    {
        return None;
    }
    let mut parts = value
        .split('.')
        .filter(|part| *part != "errors")
        .map(normalize_segment)
        .collect::<Vec<_>>();
    if parts.first().is_some_and(|part| part == "toast") {
        parts.remove(0);
        parts.insert(0, normalize_segment(domain));
    }
    if parts
        .first()
        .is_none_or(|part| part != &normalize_segment(domain))
        && !matches!(parts.first().map(String::as_str), Some("common" | "system"))
    {
        parts.insert(0, normalize_segment(domain));
    }
    (parts.len() >= 2).then(|| parts.join("."))
}

fn normalize_code(value: &str) -> String {
    value
        .split('.')
        .filter(|segment| !segment.is_empty())
        .map(normalize_segment)
        .collect::<Vec<_>>()
        .join(".")
}

fn normalize_segment(value: &str) -> String {
    let mut output = String::new();
    for (index, character) in value.chars().enumerate() {
        if character == '-' || character == ' ' {
            if !output.ends_with('_') {
                output.push('_');
            }
            continue;
        }
        if character.is_ascii_uppercase() {
            if index > 0 && !output.ends_with('_') {
                output.push('_');
            }
            output.push(character.to_ascii_lowercase());
        } else if character.is_ascii_alphanumeric() || character == '_' {
            output.push(character.to_ascii_lowercase());
        }
    }
    output.trim_matches('_').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_legacy_keys_to_stable_codes() {
        assert_eq!(
            IpcError::from_message("apex", "apex.gameSettings.errors.fileChanged: settings.cfg")
                .code,
            "apex.game_settings.file_changed"
        );
        assert_eq!(
            IpcError::from_message("apex", "toast.milesLanguageNotFound").code,
            "apex.miles_language_not_found"
        );
        assert_eq!(
            IpcError::from_message("alter_q", "filesystem failure").code,
            "alter_q.operation_failed"
        );
    }

    #[test]
    fn serializes_the_public_error_contract() {
        let value = serde_json::to_value(
            IpcError::new("folder_sharing.bad_credentials", "logon failed")
                .with_detail("win32Code", 1326),
        )
        .unwrap();
        assert_eq!(value["code"], "folder_sharing.bad_credentials");
        assert_eq!(value["message"], "logon failed");
        assert_eq!(value["details"]["win32Code"], 1326);
    }
}
