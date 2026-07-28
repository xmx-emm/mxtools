export type CheckCategory = 'input' | 'display' | 'power' | 'graphics' | 'network' | 'storage' | 'software';
export type CheckStatus = 'pass' | 'warning' | 'info' | 'unknown';
export type GamePreference = 'high_performance' | 'power_saving' | 'system_default' | 'unknown';

export interface AccessibilityStatus {
  stickyKeysEnabled: boolean;
  stickyKeysHotkeyEnabled: boolean;
  filterKeysEnabled: boolean;
  filterKeysHotkeyEnabled: boolean;
  toggleKeysEnabled: boolean;
  toggleKeysHotkeyEnabled: boolean;
  mouseKeysEnabled: boolean;
  mouseKeysHotkeyEnabled: boolean;
}
export interface MouseStatus { accelerationEnabled: boolean; threshold1: number; threshold2: number; acceleration: number; }
export interface DisplayStatus { width: number; height: number; currentRefreshHz: number; maxRefreshHz: number; }
export interface PowerStatus {
  hasBattery: boolean; acOnline: boolean | null; planGuid: string | null; planName: string | null;
  powerSaver: boolean; usbSelectiveSuspendAc: boolean | null; usbSelectiveSuspendDc: boolean | null;
}
export interface GraphicsStatus { gpus: string[]; hybrid: boolean; gamePreference: GamePreference; }
export interface NetworkAdapter { name: string; description: string; kind: 'ethernet' | 'wifi' | 'other'; linkSpeed: string; }
export interface NetworkStatus { connected: boolean; adapters: NetworkAdapter[]; }
export interface StorageStatus { path: string; drive: string; freeBytes: number; totalBytes: number; driveType: 'ssd' | 'hdd' | 'external' | 'unknown'; }
export interface ProcessItem { id: string; name: string; process: string; }
export interface GameOptimizerReport {
  scannedAtMs: number; scanDurationMs: number; accessibility: AccessibilityStatus; mouse: MouseStatus;
  display: DisplayStatus | null; power: PowerStatus; graphics: GraphicsStatus; network: NetworkStatus;
  storage: StorageStatus | null; overlays: ProcessItem[]; bandwidthApps: ProcessItem[]; unavailable: string[];
}
export interface ActionResult { id: string; success: boolean; error: string | null; }
export type GameOptimizerActionResult = ActionResult;
export interface NetworkBenchmark { host: string; sent: number; received: number; lossPercent: number; minMs: number | null; maxMs: number | null; averageMs: number | null; jitterMs: number | null; durationMs: number; }
export interface GameOptimizerCheck {
  id: string; category: CheckCategory; status: CheckStatus; weight: number; titleKey: string; detailKey: string;
  params: Record<string, string | number | boolean>; actionId?: string; settingsUri?: string;
}
export interface GameOptimizerEvaluation { score: number; checks: GameOptimizerCheck[]; warningCount: number; passCount: number; actionableCount: number; }
