//! Session-wide download queue. Launcher workers own transport; this module
//! serializes jobs and publishes state independently of any open WebView.
use crate::game::{apex, apex_language_download as steam, apex_language_download_ea as ea};
use crate::ipc_error::{IpcError, IpcResult};
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

pub const EVENT: &str = "download-manager-changed";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJob {
    id: u64,
    platform: String,
    language: String,
    ea_user_id: Option<String>,
    depot: u32,
    status: String,
    progress: steam::MilesDownloadProgress,
    created_at: String,
    updated_at: String,
    requested: Option<String>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSnapshot {
    revision: u64,
    jobs: Vec<DownloadJob>,
}

#[derive(Default)]
struct Manager {
    snapshot: DownloadSnapshot,
    sequence: u64,
    active: Option<u64>,
    stopping: bool,
}

fn cell() -> &'static Mutex<Manager> {
    static CELL: OnceLock<Mutex<Manager>> = OnceLock::new();
    CELL.get_or_init(|| Mutex::new(Manager::default()))
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}
fn terminal(status: &str) -> bool {
    matches!(status, "done" | "error" | "cancelled")
}
fn error(message: &str) -> IpcError {
    IpcError::from_message("apex", message)
}
fn publish(app: &AppHandle, snapshot: DownloadSnapshot) {
    let _ = app.emit(EVENT, snapshot);
}

impl Manager {
    fn changed(&mut self) -> DownloadSnapshot {
        self.snapshot.revision += 1;
        self.snapshot.clone()
    }
    fn next(&mut self) -> Option<DownloadJob> {
        if self.active.is_some() || self.stopping {
            return None;
        }
        let job = self
            .snapshot
            .jobs
            .iter_mut()
            .find(|j| j.status == "queued")?;
        job.status = "checking".into();
        job.updated_at = now();
        self.active = Some(job.id);
        Some(job.clone())
    }
    fn update(&mut self, platform: &str, progress: &steam::MilesDownloadProgress) -> bool {
        let Some(id) = self.active else {
            return false;
        };
        let Some(job) = self.snapshot.jobs.iter_mut().find(|j| j.id == id) else {
            return false;
        };
        if job.platform != platform || (platform == "steam" && job.depot != progress.depot) {
            return false;
        }
        job.progress = progress.clone();
        job.updated_at = now();
        job.status = if terminal(&progress.phase) {
            if job.requested.as_deref() == Some("pause") {
                "paused".into()
            } else if job.requested.as_deref() == Some("cancel") {
                "cancelled".into()
            } else {
                progress.phase.clone()
            }
        } else if job.requested.is_some() {
            "stopping".into()
        } else {
            progress.phase.clone()
        };
        if terminal(&progress.phase) {
            job.requested = None;
            self.active = None;
        }
        true
    }
}

fn dispatch(app: &AppHandle) {
    let (job, snapshot) = {
        let Ok(mut manager) = cell().lock() else {
            return;
        };
        let Some(job) = manager.next() else {
            return;
        };
        (job, manager.changed())
    };
    publish(app, snapshot);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = if job.platform == "steam" {
            steam::start_apex_language_download(app.clone(), job.depot).await
        } else {
            ea::start_apex_language_download_ea(app.clone(), job.language, job.ea_user_id).await
        };
        if let Err(e) = result {
            let mut progress = steam::MilesDownloadProgress::new(job.depot, "error");
            progress.message = e.message;
            record_progress(&app, &job.platform, &progress);
        }
    });
}

pub(crate) fn stop_requested(platform: &str, depot: u32) -> bool {
    cell().lock().ok().is_some_and(|manager| {
        manager.snapshot.jobs.iter().any(|job| {
            Some(job.id) == manager.active
                && job.platform == platform
                && (platform == "ea" || job.depot == depot)
                && job.requested.is_some()
        })
    })
}

/// Called after the worker releases its shared gate for terminal events.
pub(crate) fn record_progress(
    app: &AppHandle,
    platform: &str,
    progress: &steam::MilesDownloadProgress,
) {
    let snapshot = {
        let Ok(mut manager) = cell().lock() else {
            return;
        };
        if !manager.update(platform, progress) {
            return;
        }
        manager.changed()
    };
    publish(app, snapshot);
    if terminal(&progress.phase) {
        dispatch(app);
    }
}

async fn stop_worker(platform: &str) -> IpcResult<()> {
    if platform == "steam" {
        steam::cancel_apex_language_download(true).await
    } else {
        ea::cancel_apex_language_download_ea(true).await
    }
}

#[tauri::command]
pub async fn enqueue_apex_download(
    app: AppHandle,
    platform: String,
    language: String,
    ea_user_id: Option<String>,
) -> IpcResult<u64> {
    if !matches!(platform.as_str(), "steam" | "ea") {
        return Err(error("downloads.invalidTarget"));
    }
    let ea_user_id = if platform == "ea" {
        Some(
            ea_user_id
                .filter(|id| !id.trim().is_empty())
                .ok_or_else(|| error("downloads.eaAccountRequired"))?,
        )
    } else {
        None
    };
    let depots = apex::get_apex_languages_depots().await?;
    let depot = *depots
        .get(&language)
        .ok_or_else(|| error("downloads.invalidTarget"))? as u32;
    let (id, snapshot) = {
        let mut manager = cell().lock().map_err(|_| error("downloads.stateError"))?;
        if let Some(job) = manager.snapshot.jobs.iter().find(|j| {
            j.platform == platform
                && j.language == language
                && j.ea_user_id == ea_user_id
                && !terminal(&j.status)
        }) {
            return Ok(job.id);
        }
        if manager
            .snapshot
            .jobs
            .iter()
            .filter(|j| !terminal(&j.status))
            .count()
            >= 20
        {
            return Err(error("downloads.queueFull"));
        }
        // Bound completed history without dropping unfinished jobs.
        while manager.snapshot.jobs.len() >= 50 {
            let Some(index) = manager
                .snapshot
                .jobs
                .iter()
                .position(|j| terminal(&j.status))
            else {
                break;
            };
            manager.snapshot.jobs.remove(index);
        }
        manager.sequence += 1;
        let id = manager.sequence;
        manager.snapshot.jobs.push(DownloadJob {
            id,
            platform,
            language,
            ea_user_id,
            depot,
            status: "queued".into(),
            progress: steam::MilesDownloadProgress::new(depot, "queued"),
            created_at: now(),
            updated_at: now(),
            requested: None,
        });
        (id, manager.changed())
    };
    publish(&app, snapshot);
    dispatch(&app);
    Ok(id)
}

#[tauri::command]
pub async fn get_download_queue() -> IpcResult<DownloadSnapshot> {
    Ok(cell()
        .lock()
        .map_err(|_| error("downloads.stateError"))?
        .snapshot
        .clone())
}

/// Pausing/cancelling an active launcher download stops that launcher. The UI
/// must explain this before invoking the command; downloaded files are retained.
#[tauri::command]
pub async fn control_download(app: AppHandle, id: u64, action: String) -> IpcResult<()> {
    let (stop, snapshot) = {
        let mut manager = cell().lock().map_err(|_| error("downloads.stateError"))?;
        let active = manager.active == Some(id);
        let job = manager
            .snapshot
            .jobs
            .iter_mut()
            .find(|j| j.id == id)
            .ok_or_else(|| error("downloads.taskMissing"))?;
        let mut stop = None;
        match action.as_str() {
            "resume" | "retry"
                if matches!(job.status.as_str(), "paused" | "error" | "cancelled") =>
            {
                job.status = "queued".into();
                job.progress = steam::MilesDownloadProgress::new(job.depot, "queued");
            }
            "pause" | "cancel" if !terminal(&job.status) && job.requested.is_none() => {
                if matches!(job.status.as_str(), "applying" | "restoringLanguage") {
                    return Err(error("downloads.finishing"));
                }
                if active {
                    job.requested = Some(action.clone());
                    job.status = "stopping".into();
                    stop = Some(job.platform.clone());
                } else {
                    job.status = if action == "pause" {
                        "paused"
                    } else {
                        "cancelled"
                    }
                    .into();
                }
            }
            _ => return Err(error("downloads.invalidAction")),
        }
        job.updated_at = now();
        if stop.is_some() {
            manager.stopping = true;
        }
        (stop, manager.changed())
    };
    publish(&app, snapshot);
    if let Some(platform) = stop {
        let result = stop_worker(&platform).await;
        if let Ok(mut manager) = cell().lock() {
            manager.stopping = false;
        }
        if let Err(e) = result {
            let snapshot = {
                let mut manager = cell().lock().map_err(|_| error("downloads.stateError"))?;
                if let Some(job) = manager.snapshot.jobs.iter_mut().find(|j| j.id == id) {
                    job.requested = None;
                    job.status = job.progress.phase.clone();
                }
                manager.changed()
            };
            publish(&app, snapshot);
            return Err(e);
        }
    }
    dispatch(&app);
    Ok(())
}

#[tauri::command]
pub async fn clear_finished_downloads(app: AppHandle) -> IpcResult<()> {
    let snapshot = {
        let mut manager = cell().lock().map_err(|_| error("downloads.stateError"))?;
        manager.snapshot.jobs.retain(|j| !terminal(&j.status));
        manager.changed()
    };
    publish(&app, snapshot);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/game/download_manager.rs"
    ));
}
