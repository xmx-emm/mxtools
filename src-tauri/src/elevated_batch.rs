//! 单次 UAC 执行多个修复动作，并按动作记录成败。
//!
//! 每个动作的命令组以 `&&` 串联，组之间以 `&` 串联（前一组失败不影响后续组）；
//! 每组结束后向临时状态文件追加 `<action>=ok` 或 `<action>=fail`。

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use windows_tool::utils::{run_commands, RunCommandOptions};

/// 一个动作及其按顺序执行的命令。
pub(crate) struct ActionCommands {
    pub(crate) action: String,
    pub(crate) commands: Vec<String>,
}

/// 拼出整批 `cmd /C` 命令行。没有命令的动作不出现在批处理中。
pub(crate) fn build_status_batch(groups: &[ActionCommands], status_file: &Path) -> String {
    let status = status_file.display();
    groups
        .iter()
        .filter(|group| !group.commands.is_empty())
        .map(|group| {
            format!(
                "(({}) && (>>\"{status}\" echo {action}=ok) || (>>\"{status}\" echo {action}=fail))",
                group.commands.join(" && "),
                action = group.action,
            )
        })
        .collect::<Vec<_>>()
        .join(" & ")
}

/// 解析状态文件；同一动作出现多次时以 `fail` 为准。
pub(crate) fn parse_status_file(content: &str) -> HashMap<String, bool> {
    let mut statuses = HashMap::new();
    for line in content.lines() {
        let Some((action, status)) = line.trim().split_once('=') else {
            continue;
        };
        let ok = match status.trim() {
            "ok" => true,
            "fail" => false,
            _ => continue,
        };
        let entry = statuses.entry(action.trim().to_string()).or_insert(ok);
        *entry &= ok;
    }
    statuses
}

/// 汇总结果：状态文件记录了某动作时以其为准；整批命令失败或状态文件不可读
/// （例如提权到了另一账号、无法写入本用户临时目录）时退回整批结果。
pub(crate) fn resolve_action_results(
    groups: &[ActionCommands],
    batch_ok: bool,
    statuses: Option<&HashMap<String, bool>>,
) -> HashMap<String, Result<(), String>> {
    groups
        .iter()
        .map(|group| {
            let result = if group.commands.is_empty() {
                Ok(())
            } else {
                match statuses.filter(|map| !map.is_empty()) {
                    Some(map) => match map.get(&group.action) {
                        Some(true) => Ok(()),
                        Some(false) => Err(format!("{} failed", group.action)),
                        None => Err(format!("{} did not run", group.action)),
                    },
                    None if batch_ok => Ok(()),
                    None => Err("elevated batch failed".to_string()),
                }
            };
            (group.action.clone(), result)
        })
        .collect()
}

fn unique_status_file() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    std::env::temp_dir().join(format!(
        "mxtools-elevated-{}-{nanos}.status",
        std::process::id()
    ))
}

/// 以一次（必要时提权的）`cmd /C` 执行全部动作，返回每个动作的结果。
pub(crate) fn run_action_batch(
    groups: &[ActionCommands],
    use_admin: bool,
) -> HashMap<String, Result<(), String>> {
    let mut seen = HashSet::new();
    debug_assert!(groups.iter().all(|group| seen.insert(group.action.as_str())));
    if groups.iter().all(|group| group.commands.is_empty()) {
        return resolve_action_results(groups, true, None);
    }
    let status_file = unique_status_file();
    let batch = build_status_batch(groups, &status_file);
    let batch_ok = run_commands(&batch, RunCommandOptions::new(true, use_admin, false)).is_ok();
    let statuses = std::fs::read(&status_file)
        .ok()
        .map(|bytes| parse_status_file(&String::from_utf8_lossy(&bytes)));
    let _ = std::fs::remove_file(&status_file);
    resolve_action_results(groups, batch_ok, statuses.as_ref())
}

#[cfg(test)]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/elevated_batch.rs"
    ));
}
