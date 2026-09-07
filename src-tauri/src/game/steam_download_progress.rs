//! Steam console depot progress, measured in completed chunks, not file lengths.
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub(super) const SOURCES_JS: &str = r"new Promise(resolve => {
  const lines = [];
  let quiet;
  let finished = false;
  let reg;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(quiet);
    clearTimeout(deadline);
    try { reg && reg.unregister(); } catch (_) {}
    resolve(lines.join('\n'));
  };
  const deadline = setTimeout(finish, 1500);
  reg = SteamClient.Console.RegisterForSpewOutput(rec => {
    lines.push(String((rec && rec.spew) || ''));
    clearTimeout(quiet);
    quiet = setTimeout(finish, 300);
  });
  SteamClient.Console.ExecCommand('download_sources');
})";

#[derive(Debug, PartialEq)]
pub(super) struct SourceProgress {
    pub completed: u64,
    pub busy: bool,
}

fn count_before(text: &str, suffix: &str) -> Option<u64> {
    text.split_once(suffix)?
        .0
        .split_whitespace()
        .last()?
        .parse()
        .ok()
}

pub(super) fn parse_sources(text: &str) -> Option<SourceProgress> {
    let (_, jobs) = text.split_once("Download jobs:")?;
    let mut completed = 0u64;
    let mut busy = false;
    let mut rows = 0;
    let mut details = 0;
    for line in jobs.lines().map(str::trim) {
        if line.starts_with("Iteration ") {
            completed = completed.checked_add(count_before(line, " succeeded")?)?;
            busy |= count_before(line, " outstanding")? > 0 || count_before(line, " deferred")? > 0;
            rows += 1;
        } else if line.starts_with("- type ") {
            details += 1;
        }
    }
    // Every summary has at least one source detail. Reject truncated replies.
    (details >= rows).then_some(SourceProgress { completed, busy })
}

pub(super) struct ChunkProgress {
    app_id: u32,
    depot: u32,
    total: Option<u64>,
    last: u64,
    sampled: bool,
    missed: u8,
    invalid: bool,
}

impl ChunkProgress {
    pub fn new(app_id: u32, depot: u32, idle: bool) -> Self {
        Self {
            app_id,
            depot,
            total: None,
            last: 0,
            sampled: false,
            missed: 0,
            invalid: !idle,
        }
    }

    pub fn observe_log(&mut self, text: &str) {
        for line in text.lines() {
            let line = line.split_once("] ").map_or(line, |(_, body)| body);
            if let Some(rest) = line.strip_prefix("Downloading ") {
                if let Some((count, rest)) = rest.split_once(" chunks for depot ") {
                    let depot = rest
                        .split_whitespace()
                        .next()
                        .and_then(|s| s.parse::<u32>().ok());
                    if depot == Some(self.depot) && self.total.is_none() {
                        self.total = count.parse::<u64>().ok().filter(|n| *n > 0);
                        self.invalid |= self.total.is_none();
                    } else {
                        self.invalid = true;
                    }
                }
            }
            if let Some(rest) = line.strip_prefix("AppID ") {
                if rest.contains(" update started :") {
                    let app = rest
                        .split_whitespace()
                        .next()
                        .and_then(|s| s.parse::<u32>().ok());
                    self.invalid |= app != Some(self.app_id) || self.total.is_some();
                }
            }
        }
    }

    pub fn sample(&mut self, sources: Option<SourceProgress>) -> Option<(u64, u64)> {
        let total = self.total?;
        if self.invalid {
            return None;
        }
        let Some(source) = sources else {
            // A delayed console reply must not flash the UI back to unknown.
            // Log-based overlap/invalidation still takes effect on every poll.
            self.missed = self.missed.saturating_add(1);
            return (self.sampled && self.missed <= 3).then_some((self.last, total));
        };
        self.missed = 0;
        // Global source counters are useful only for an isolated depot job.
        // A reset, extra download, or changed output format drops determination.
        if source.completed < self.last || source.completed > total {
            self.invalid = true;
        }
        if self.invalid {
            return None;
        }
        self.last = source.completed;
        self.sampled = true;
        Some((source.completed, total))
    }
}

pub(super) struct ContentLog {
    file: File,
    path: PathBuf,
    created: SystemTime,
    pending: Vec<u8>,
}

impl ContentLog {
    pub fn open(path: &Path) -> std::io::Result<Self> {
        let mut file = File::open(path)?;
        let created = file.metadata()?.created()?;
        file.seek(SeekFrom::End(0))?;
        Ok(Self {
            file,
            path: path.to_path_buf(),
            created,
            pending: Vec::new(),
        })
    }

    pub fn poll(&mut self) -> std::io::Result<String> {
        let metadata = std::fs::metadata(&self.path)?;
        if metadata.created()? != self.created || metadata.len() < self.file.stream_position()? {
            return Err(std::io::Error::other("Steam content log truncated"));
        }
        // Bound work per poll; never scan historical downloads or partial lines.
        let mut bytes = [0u8; 65536];
        let count = self.file.read(&mut bytes)?;
        self.pending.extend_from_slice(&bytes[..count]);
        if self.pending.len() > 262144 || count == bytes.len() {
            return Err(std::io::Error::other("Steam content log backlog"));
        }
        let end = self
            .pending
            .iter()
            .rposition(|b| *b == b'\n')
            .map_or(0, |i| i + 1);
        let text = String::from_utf8_lossy(&self.pending[..end]).into_owned();
        self.pending.drain(..end);
        Ok(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/game/steam_download_progress.rs"
    ));
}
