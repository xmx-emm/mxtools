import {invoke} from '@tauri-apps/api/core';
import {IpcCommandError, normalizeIpcError} from '@/ipc/error.ts';
import type {InputMethodItem, WubiLexiconInfo} from '@/types/inputMethod.ts';
import type {PortForwarding} from '@/types/network.ts';
import type {RdpConnection} from '@/types/rdp.ts';
import type {WindowsUser} from '@/types/windows.ts';
import type {SteamUser} from '@/types/steam.ts';
import type {EaDesktopUser} from '@/types/ea.ts';
import type {ContextMenuItem, CustomBackgroundFolder} from '@/types/explorer.ts';
import type {AppInfo} from '@/types/app.ts';
import type {PrimaryDisplayInfo} from '@/types/apex_quick_preset.ts';
import type {
  ApexConfigHistoryEntry,
  ApexConfigMutationRequest,
  ApexConfigMutationResult,
  ApexConfigMutationMeta,
  ApexHistoryRestoreResult,
  ApexLauncherRef,
  ApexResetResult,
} from '@/types/apex_history.ts';
import type {ApexQCaptureResult, ApexQRoi, ApexQThetaResult} from '@/types/apex_q.ts';
import type {
  ApexGameSettingsApplyRequest,
  ApexGameSettingsReport,
  ApexGameSettingsRestoreRequest,
} from '@/types/apex_game_settings.ts';
import type {
  GameOptimizerActionResult,
  GameOptimizerReport,
  NetworkBenchmark,
} from '@/types/game_optimizer.ts';
import type {
  LocalShare,
  MappedDrive,
  NetworkDevice,
  NtfsAclPreview,
  RemoteConnectionRequest,
  RemoteShare,
  RemoveShareResult,
  RepairResult,
  ShareAccount,
  ShareAccessSummary,
  ShareApplyResult,
  ShareDetails,
  ShareHealthReport,
  ShareMutationRequest,
  SmbActivity,
} from '@/types/folder_sharing.ts';

/** Typed wrapper around Tauri `invoke`. */
export async function ipcInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    const payload = normalizeIpcError(error, cmd);
    console.error('Tauri IPC command failed', {command: cmd, payload, error});
    throw new IpcCommandError(cmd, payload, error);
  }
}

// ── elevated ──────────────────────────────────────────────

export function isElevated(): Promise<boolean> {
  return ipcInvoke<boolean>('is_elevated');
}

export function restartRequestElevation(): Promise<void> {
  return ipcInvoke<void>('restart_request_elevation');
}

// ── game optimizer ───────────────────────────────────────

export function scanGameOptimizer(args: {
  gamePath?: string | null;
} = {}): Promise<GameOptimizerReport> {
  return ipcInvoke<GameOptimizerReport>('scan_game_optimizer', args);
}

export function applyGameOptimizer(args: {
  actions: string[];
}): Promise<GameOptimizerActionResult[]> {
  return ipcInvoke<GameOptimizerActionResult[]>('apply_game_optimizer', args);
}

export function benchmarkGameNetwork(args: {
  host: string;
  count?: number;
}): Promise<NetworkBenchmark> {
  return ipcInvoke<NetworkBenchmark>('benchmark_game_network', args);
}

// ── folder sharing ───────────────────────────────────────

export function listLocalShares(): Promise<LocalShare[]> {
  return ipcInvoke<LocalShare[]>('list_local_shares');
}

export function listLocalShareAccess(): Promise<ShareAccessSummary[]> {
  return ipcInvoke<ShareAccessSummary[]>('list_local_share_access');
}

export function listShareAccounts(): Promise<ShareAccount[]> {
  return ipcInvoke<ShareAccount[]>('list_share_accounts');
}

export function previewLocalShare(args: {
  request: ShareMutationRequest;
}): Promise<NtfsAclPreview> {
  return ipcInvoke<NtfsAclPreview>('preview_local_share', args);
}

export function applyLocalShare(args: {
  request: ShareMutationRequest;
}): Promise<ShareApplyResult> {
  return ipcInvoke<ShareApplyResult>('apply_local_share', args);
}

export function getLocalShareDetails(args: {name: string}): Promise<ShareDetails> {
  return ipcInvoke<ShareDetails>('get_local_share_details', args);
}

export function removeLocalShare(args: {
  name: string;
  force: boolean;
  cleanupNtfs: boolean;
}): Promise<RemoveShareResult> {
  return ipcInvoke<RemoveShareResult>('remove_local_share', args);
}

export function discoverNetworkDevices(): Promise<NetworkDevice[]> {
  return ipcInvoke<NetworkDevice[]>('discover_network_devices');
}

export function listRemoteShares(args: {server: string}): Promise<RemoteShare[]> {
  return ipcInvoke<RemoteShare[]>('list_remote_shares', args);
}

export function listMappedDrives(): Promise<MappedDrive[]> {
  return ipcInvoke<MappedDrive[]>('list_mapped_drives');
}

export function openSharedFolder(args: {path: string}): Promise<void> {
  return ipcInvoke<void>('open_shared_folder', args);
}

export function connectRemoteShare(args: {
  request: RemoteConnectionRequest;
}): Promise<MappedDrive> {
  return ipcInvoke<MappedDrive>('connect_remote_share', args);
}

export function disconnectRemoteShare(args: {
  name: string;
  remotePath: string;
  forgetPersistent: boolean;
  force: boolean;
  forgetCredentials: boolean;
}): Promise<void> {
  return ipcInvoke<void>('disconnect_remote_share', args);
}

export function disconnectRemoteServer(args: {
  server: string;
  force: boolean;
  forgetCredentials: boolean;
}): Promise<number> {
  return ipcInvoke<number>('disconnect_remote_server', args);
}

export function getSmbActivity(): Promise<SmbActivity> {
  return ipcInvoke<SmbActivity>('get_smb_activity');
}

export function closeSmbSession(args: {sessionId: string}): Promise<void> {
  return ipcInvoke<void>('close_smb_session', args);
}

export function closeSmbOpenFile(args: {fileId: string}): Promise<void> {
  return ipcInvoke<void>('close_smb_open_file', args);
}

export function scanFolderSharingHealth(): Promise<ShareHealthReport> {
  return ipcInvoke<ShareHealthReport>('scan_folder_sharing_health');
}

export function repairFolderSharing(args: {
  actions: string[];
  confirmPublicProfileChange: boolean;
}): Promise<RepairResult[]> {
  return ipcInvoke<RepairResult[]>('repair_folder_sharing', args);
}

// ── rdp ───────────────────────────────────────────────────

export function getRdpEnabled(): Promise<boolean> {
  return ipcInvoke<boolean>('get_rdp_enabled');
}

export function setRdpEnabled(args: {enabled: boolean}): Promise<void> {
  return ipcInvoke<void>('set_rdp_enabled', args);
}

export function getRdpPort(): Promise<number> {
  return ipcInvoke<number>('get_rdp_port');
}

export function setRdpPort(args: {port: number}): Promise<void> {
  return ipcInvoke<void>('set_rdp_port', args);
}

export function getRdpUsers(): Promise<string[]> {
  return ipcInvoke<string[]>('get_rdp_users');
}

export function addRdpUser(args: {username: string}): Promise<void> {
  return ipcInvoke<void>('add_rdp_user', args);
}

export function removeRdpUser(args: {username: string}): Promise<void> {
  return ipcInvoke<void>('remove_rdp_user', args);
}

export function checkRemotePort(args: {ip: string; port: number}): Promise<boolean> {
  return ipcInvoke<boolean>('check_remote_port', args);
}

export function connectRdp(args: {
  ip: string;
  port: number;
  username?: string | null;
}): Promise<void> {
  return ipcInvoke<void>('connect_rdp', args);
}

export function loadRdpConnections(): Promise<RdpConnection[]> {
  return ipcInvoke<RdpConnection[]>('load_rdp_connections');
}

export function saveRdpConnections(args: {connections: RdpConnection[]}): Promise<void> {
  return ipcInvoke<void>('save_rdp_connections', args);
}

export function exportRdpFile(args: {connection: RdpConnection; path: string}): Promise<void> {
  return ipcInvoke<void>('export_rdp_file', args);
}

// ── windows users ─────────────────────────────────────────

export function getWindowsUsers(): Promise<WindowsUser[]> {
  return ipcInvoke<WindowsUser[]>('get_windows_users');
}

export function addWindowsUser(args: {
  username: string;
  password: string;
}): Promise<void> {
  return ipcInvoke<void>('add_windows_user', args);
}

export function deleteWindowsUser(args: {username: string}): Promise<void> {
  return ipcInvoke<void>('delete_windows_user', args);
}

export function modifyWindowsUserPassword(args: {
  username: string;
  newPassword: string;
}): Promise<void> {
  return ipcInvoke<void>('modify_windows_user_password', args);
}

export function renameWindowsUser(args: {
  oldName: string;
  newName: string;
}): Promise<void> {
  return ipcInvoke<void>('rename_windows_user', args);
}

// ── port forwarding ───────────────────────────────────────

export function getPortForwarding(): Promise<PortForwarding[]> {
  return ipcInvoke<PortForwarding[]>('get_port_forwarding');
}

export function resetPortForwarding(): Promise<PortForwarding[]> {
  return ipcInvoke<PortForwarding[]>('reset_port_forwarding');
}

export function setPortForwarding(args: {item: PortForwarding}): Promise<PortForwarding[]> {
  return ipcInvoke<PortForwarding[]>('set_port_forwarding', args);
}

export function createMultiplePortForwarding(args: {
  list: PortForwarding[];
}): Promise<PortForwarding[]> {
  return ipcInvoke<PortForwarding[]>('create_multiple_port_forwarding', args);
}

export function delPortForwarding(args: {item: PortForwarding}): Promise<PortForwarding[]> {
  return ipcInvoke<PortForwarding[]>('del_port_forwarding', args);
}

export function loadPortForwarding(args: {filepath: string}): Promise<PortForwarding[]> {
  return ipcInvoke<PortForwarding[]>('load_port_forwarding', args);
}

export function backupsPortForwarding(args: {output: string}): Promise<boolean> {
  return ipcInvoke<boolean>('backups_port_forwarding', args);
}

export function backupsPortForwardingDefaultPath(): Promise<string | null> {
  return ipcInvoke<string | null>('backups_port_forwarding_default_path');
}

// ── input method ──────────────────────────────────────────

export function getInputMethods(): Promise<InputMethodItem[]> {
  return ipcInvoke<InputMethodItem[]>('get_input_methods');
}

export function getAvailableInputMethods(): Promise<InputMethodItem[]> {
  return ipcInvoke<InputMethodItem[]>('get_available_input_methods');
}

export function reorderInputMethods(args: {ids: string[]}): Promise<void> {
  return ipcInvoke<void>('reorder_input_methods', args);
}

export function addInputMethod(args: {id: string}): Promise<void> {
  return ipcInvoke<void>('add_input_method', args);
}

export function removeInputMethod(args: {id: string; tip?: string | null}): Promise<void> {
  return ipcInvoke<void>('remove_input_method', args);
}

export function addUsKeyboard(): Promise<void> {
  return ipcInvoke<void>('add_us_keyboard');
}

export function openInputMethodSettings(args: {id: string; name: string}): Promise<void> {
  return ipcInvoke<void>('open_input_method_settings', args);
}

export function disableChsSimplifiedTraditionalHotkey(): Promise<void> {
  return ipcInvoke<void>('disable_chs_simplified_traditional_hotkey');
}

export function getWubiLexiconInfo(): Promise<WubiLexiconInfo> {
  return ipcInvoke<WubiLexiconInfo>('get_wubi_lexicon_info');
}

export function importWubiSystemLexicon(args: {filePath: string}): Promise<void> {
  return ipcInvoke<void>('import_wubi_system_lexicon', args);
}

export function importWubiUserPhrases(args: {filePath: string}): Promise<void> {
  return ipcInvoke<void>('import_wubi_user_phrases', args);
}

export function exportWubiUserPhrases(args: {filePath: string}): Promise<void> {
  return ipcInvoke<void>('export_wubi_user_phrases', args);
}

export function restoreWubiSystemLexicon(args: {backupId?: string | null}): Promise<void> {
  return ipcInvoke<void>('restore_wubi_system_lexicon', args);
}

export function openMsSettingsPage(args: {uri: string}): Promise<void> {
  return ipcInvoke<void>('open_ms_settings_page', args);
}

// ── process: apex / steam / ea ────────────────────────────

export function apexIsRunning(): Promise<boolean> {
  return ipcInvoke<boolean>('apex_is_running');
}

export function thoroughlyKillApex(): Promise<number> {
  return ipcInvoke<number>('thoroughly_kill_apex');
}

export function steamIsRunningByTasklist(): Promise<boolean> {
  return ipcInvoke<boolean>('steam_is_running_by_tasklist');
}

export function thoroughlyKillSteam(): Promise<number> {
  return ipcInvoke<number>('thoroughly_kill_steam');
}

export function eaDesktopIsRunningByTasklist(): Promise<boolean> {
  return ipcInvoke<boolean>('ea_desktop_is_running_by_tasklist');
}

export function thoroughlyKillEaDesktop(): Promise<number> {
  return ipcInvoke<number>('thoroughly_kill_ea_desktop');
}

// ── common folders / explorer ─────────────────────────────

export function getAllCommonFolders(): Promise<Record<string, boolean>> {
  return ipcInvoke<Record<string, boolean>>('get_all_common_folders');
}

export function hideCommonFolders(args: {key: string}): Promise<boolean> {
  return ipcInvoke<boolean>('hide_common_folders', args);
}

export function showCommonFolders(args: {key: string}): Promise<boolean> {
  return ipcInvoke<boolean>('show_common_folders', args);
}

export function explorerFolder(): Promise<string> {
  return ipcInvoke<string>('explorer_folder');
}

export function explorerRegistryPath(): Promise<string> {
  return ipcInvoke<string>('explorer_registry_path');
}

export function checkBackupsExplorerRegistry(): Promise<boolean> {
  return ipcInvoke<boolean>('check_backups_explorer_registry');
}

export function backupsExplorerRegistry(): Promise<boolean> {
  return ipcInvoke<boolean>('backups_explorer_registry');
}

export function openFolderDetached(args: {path: string}): Promise<void> {
  return ipcInvoke<void>('open_folder_detached', args);
}

// ── PUBG ──────────────────────────────────────────────────

export function getPubgLaunchOption(args: {id: number}): Promise<string> {
  return ipcInvoke<string>('get_pubg_launch_option', args);
}

export function setPubgLaunchOption(args: {
  id: number;
  launchOption: string;
}): Promise<void> {
  return ipcInvoke<void>('set_pubg_launch_option', args);
}

export function checkPubgSkipIntroMoviesDisabled(): Promise<boolean> {
  return ipcInvoke<boolean>('check_pubg_skip_intro_movies_disabled');
}

export function setPubgSkipIntroMoviesDisabled(args: {
  disabled: boolean;
}): Promise<void> {
  return ipcInvoke<void>('set_pubg_skip_intro_movies_disabled', args);
}

export function systemTotalMemoryMb(): Promise<number> {
  return ipcInvoke<number>('system_total_memory_mb');
}

export function getPubgLogsFolderPath(): Promise<string> {
  return ipcInvoke<string>('get_pubg_logs_folder_path');
}

// ── Steam / EA users ──────────────────────────────────────

export function getSteamUsers(): Promise<SteamUser[]> {
  return ipcInvoke<SteamUser[]>('get_steam_users');
}

export function getEaDesktopUsers(): Promise<EaDesktopUser[]> {
  return ipcInvoke<EaDesktopUser[]>('get_ea_desktop_users');
}

// ── Apex ──────────────────────────────────────────────────

export function getApexLaunchOption(args: {id: number}): Promise<string> {
  return ipcInvoke<string>('get_apex_launch_option', args);
}

export function getApexLaunchOptionEa(args: {eaUserId: string}): Promise<string> {
  return ipcInvoke<string>('get_apex_launch_option_ea', args);
}

export function setApexLaunchOption(args: {
  id: number;
  launchOption: string;
} & ApexConfigMutationMeta): Promise<void> {
  return ipcInvoke<void>('set_apex_launch_option', {...args});
}

export function setApexLaunchOptionEa(args: {
  eaUserId: string;
  launchOption: string;
} & ApexConfigMutationMeta): Promise<void> {
  return ipcInvoke<void>('set_apex_launch_option_ea', {...args});
}

export function getApexVideoConfig(): Promise<Record<string, string>> {
  return ipcInvoke<Record<string, string>>('get_apex_video_config');
}

export function getApexConfigFile(args: {kind: string}): Promise<Record<string, string>> {
  return ipcInvoke<Record<string, string>>('get_apex_config_file', args);
}

export function getApexGameSettings(): Promise<ApexGameSettingsReport> {
  return ipcInvoke<ApexGameSettingsReport>('get_apex_game_settings');
}

export function applyApexGameSettings(
  request: ApexGameSettingsApplyRequest,
): Promise<ApexGameSettingsReport> {
  return ipcInvoke<ApexGameSettingsReport>('apply_apex_game_settings', {request});
}

export function restoreApexGameSettings(
  request: ApexGameSettingsRestoreRequest,
): Promise<ApexGameSettingsReport> {
  return ipcInvoke<ApexGameSettingsReport>('restore_apex_game_settings', {request});
}

export function setApexVideoConfig(args: {
  updates: Record<string, string>;
} & ApexConfigMutationMeta): Promise<void> {
  return ipcInvoke<void>('set_apex_video_config', {...args});
}

export function getApexVideoconfigReadonly(): Promise<boolean> {
  return ipcInvoke<boolean>('get_apex_videoconfig_readonly');
}

export function setApexVideoconfigReadonly(args: {locked: boolean}): Promise<void> {
  return ipcInvoke<void>('set_apex_videoconfig_readonly', args);
}

export function getApexVideoconfigFolderPath(): Promise<string> {
  return ipcInvoke<string>('get_apex_videoconfig_folder_path');
}

export function listApexConfigHistory(): Promise<ApexConfigHistoryEntry[]> {
  return ipcInvoke<ApexConfigHistoryEntry[]>('list_apex_config_history');
}

export function mutateApexConfig(args: {
  request: ApexConfigMutationRequest;
}): Promise<ApexConfigMutationResult> {
  return ipcInvoke<ApexConfigMutationResult>('mutate_apex_config', args);
}

export function restoreApexConfigHistory(args: {
  request: {entryId: string; launcher: ApexLauncherRef | null};
}): Promise<ApexHistoryRestoreResult> {
  return ipcInvoke<ApexHistoryRestoreResult>('restore_apex_config_history', args);
}

export function resetApexToGameDefaults(args: {
  launcher: ApexLauncherRef;
}): Promise<ApexResetResult> {
  return ipcInvoke<ApexResetResult>('reset_apex_to_game_defaults', args);
}

export function getPrimaryDisplayInfo(): Promise<PrimaryDisplayInfo> {
  return ipcInvoke<PrimaryDisplayInfo>('get_primary_display_info');
}

export function readUtf8File(args: {path: string}): Promise<string> {
  return ipcInvoke<string>('read_utf8_file', args);
}

export function writeUtf8File(args: {path: string; content: string}): Promise<void> {
  return ipcInvoke<void>('write_utf8_file', args);
}

export function checkApexMilesLanguage(args: {
  language: string;
  platform: string;
  eaUserId?: string | null;
}): Promise<boolean> {
  return ipcInvoke<boolean>('check_apex_miles_language', args);
}

export function applyApexMilesLanguage(args: {
  depot: string | number;
  platform: string;
  eaUserId?: string | null;
}): Promise<void> {
  return ipcInvoke<void>('apply_apex_miles_language', args);
}

export function openApexAudioFolderPath(args: {
  platform: string;
  eaUserId?: string | null;
}): Promise<void> {
  return ipcInvoke<void>('open_apex_audio_folder_path', args);
}

export function openApexDepotDownloadFolderPath(args: {
  depot: string | number;
  platform: string;
  eaUserId?: string | null;
}): Promise<void> {
  return ipcInvoke<void>('open_apex_depot_download_folder_path', args);
}

// ── explorer / context menu ───────────────────────────────

export function listContextMenuItems(): Promise<ContextMenuItem[]> {
  return ipcInvoke<ContextMenuItem[]>('list_context_menu_items');
}

export function setContextMenuItemEnabled(args: {
  id: string;
  enabled: boolean;
}): Promise<ContextMenuItem> {
  return ipcInvoke<ContextMenuItem>('set_context_menu_item_enabled', args);
}

export function listCustomBackgroundFolders(): Promise<CustomBackgroundFolder[]> {
  return ipcInvoke<CustomBackgroundFolder[]>('list_custom_background_folders');
}

export function addCustomBackgroundFolder(args: {
  name: string;
  path: string;
}): Promise<void> {
  return ipcInvoke<void>('add_custom_background_folder', args);
}

export function setCustomBackgroundFolderEnabled(args: {
  id: string;
  enabled: boolean;
}): Promise<void> {
  return ipcInvoke<void>('set_custom_background_folder_enabled', args);
}

export function removeCustomBackgroundFolder(args: {id: string}): Promise<void> {
  return ipcInvoke<void>('remove_custom_background_folder', args);
}

export function modifyWindowsUpdateTime(args: {days: number}): Promise<void> {
  return ipcInvoke<void>('modify_windows_update_time', args);
}

// ── app / logs / misc ─────────────────────────────────────

export function getAppInfo(): Promise<AppInfo> {
  return ipcInvoke<AppInfo>('get_app_info');
}

/** 是否由开机自启拉起（带 `--autostart` 参数） */
export function isLaunchedFromAutostart(): Promise<boolean> {
  return ipcInvoke<boolean>('is_launched_from_autostart');
}

export function getLogFolderPath(): Promise<string> {
  return ipcInvoke<string>('get_log_folder_path');
}

export function getLogsForFeedback(): Promise<{backend: string; frontend: string}> {
  return ipcInvoke<{backend: string; frontend: string}>('get_logs_for_feedback');
}

export function getSystemInfo(): Promise<[string, string][]> {
  return ipcInvoke<[string, string][]>('system_info');
}

export function repairWindowsIconCache(): Promise<void> {
  return ipcInvoke<void>('repair_windows_icon_cache');
}

export function writeFrontendLog(args: {
  level: string;
  message: string;
}): Promise<void> {
  return ipcInvoke<void>('write_frontend_log', args);
}

export function openDevtools(): Promise<void> {
  return ipcInvoke<void>('open_devtools');
}

// ── APEX Q ballistics calculator ──────────────────────────
export function apexQOcrAvailable(): Promise<boolean> {
  return ipcInvoke<boolean>('apex_q_ocr_available');
}

export type ApexQOcrStatus = {
  rapidReady: boolean;
  winReady: boolean;
  installDir: string;
  activeEngine: string;
};

export function apexQOcrStatus(): Promise<ApexQOcrStatus> {
  return ipcInvoke<ApexQOcrStatus>('apex_q_ocr_status');
}

export function apexQOcrDownload(): Promise<void> {
  return ipcInvoke<void>('apex_q_ocr_download');
}

export function apexQOcrDelete(): Promise<void> {
  return ipcInvoke<void>('apex_q_ocr_delete');
}

export type ApexQSteamScreenshotDir = {
  userId: string;
  userName: string;
  path: string;
  exists: boolean;
};

export function apexQNormalizePath(args: {path: string}): Promise<string> {
  return ipcInvoke<string>('apex_q_normalize_path', args);
}

export function apexQListSteamScreenshotDirs(): Promise<ApexQSteamScreenshotDir[]> {
  return ipcInvoke<ApexQSteamScreenshotDir[]>('apex_q_list_steam_screenshot_dirs');
}

export function apexQSuggestedScreenshotDir(): Promise<string | null> {
  return ipcInvoke<string | null>('apex_q_suggested_screenshot_dir');
}

export function apexQLatestScreenshot(args: {folder: string}): Promise<string> {
  return ipcInvoke<string>('apex_q_latest_screenshot', args);
}

export function apexQListRecentScreenshots(args: {
  folder: string;
  limit: number;
}): Promise<string[]> {
  return ipcInvoke<string[]>('apex_q_list_recent_screenshots', args);
}

export function apexQScreenshotPreview(args: {
  path: string;
  maxEdge: number;
}): Promise<string> {
  return ipcInvoke<string>('apex_q_screenshot_preview', args);
}

export type ApexQOcrParseResult = {
  alpha: number | null;
  angYaw: number | null;
  angRoll: number | null;
  distanceM: number | null;
  showposText: string;
  pingText: string;
  showposPreview: string;
  pingPreview: string;
  showposEngine: string;
  pingEngine: string;
  showposConfidence: number | null;
  pingConfidence: number | null;
};

export function apexQTestOcr(args: {
  path: string;
  showposRoi: ApexQRoi;
  pingRoi: ApexQRoi;
  /** 只识别当前校准项；缺省则两个都识别 */
  kind?: 'showpos' | 'ping';
  /** rapid | win | auto；缺省 auto */
  engine?: 'rapid' | 'win' | 'auto';
}): Promise<ApexQOcrParseResult> {
  return ipcInvoke<ApexQOcrParseResult>('apex_q_test_ocr', args);
}

export function apexQComputeTheta(args: {r: number; alpha: number}): Promise<ApexQThetaResult> {
  return ipcInvoke<ApexQThetaResult>('apex_q_compute_theta', args);
}

export function apexQDefaultRois(): Promise<[ApexQRoi, ApexQRoi]> {
  return ipcInvoke<[ApexQRoi, ApexQRoi]>('apex_q_default_rois');
}

export function apexQFromLatestScreenshot(args: {
  folder: string;
  delayMs: number;
  showposRoi: ApexQRoi;
  pingRoi: ApexQRoi;
  engine?: 'rapid' | 'win' | 'auto';
  /**
   * Unix epoch milliseconds captured immediately before a hotkey-triggered
   * capture. The backend uses this to reject an older screenshot.
   */
  captureStartedAtMs?: number;
  /** Require the selected image to be newer than captureStartedAtMs. */
  requireFresh?: boolean;
}): Promise<ApexQCaptureResult> {
  return ipcInvoke<ApexQCaptureResult>('apex_q_from_latest_screenshot', args);
}

export function apexQOpenOcrSettings(): Promise<void> {
  return ipcInvoke<void>('apex_q_open_ocr_settings');
}

export function apexQSetCloseToTray(args: {enabled: boolean}): Promise<void> {
  return ipcInvoke<void>('apex_q_set_close_to_tray', args);
}

/** 主窗口可见时隐藏托盘，隐藏时显示托盘 */
export function syncTrayWithMainWindow(): Promise<void> {
  return ipcInvoke<void>('sync_tray_with_main_window');
}

export function setTrayLocale(locale: string): Promise<void> {
  return ipcInvoke<void>('set_tray_locale', {locale});
}

export function setTrayBetaFeatures(enabled: boolean): Promise<void> {
  return ipcInvoke<void>('set_tray_beta_features', {enabled});
}
