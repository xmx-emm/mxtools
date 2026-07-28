import { describe, expect, it } from 'vitest';
import { evaluateGameOptimizer } from './game_optimizer';
import type { GameOptimizerReport, NetworkBenchmark } from '@/types/game_optimizer';

const base = (): GameOptimizerReport => ({
  scannedAtMs: 1,
  scanDurationMs: 1,
  accessibility: { stickyKeysEnabled: false, stickyKeysHotkeyEnabled: false, filterKeysEnabled: false, filterKeysHotkeyEnabled: false, toggleKeysEnabled: false, toggleKeysHotkeyEnabled: false, mouseKeysEnabled: false, mouseKeysHotkeyEnabled: false },
  mouse: { accelerationEnabled: false, threshold1: 0, threshold2: 0, acceleration: 0 },
  display: { width: 1920, height: 1080, currentRefreshHz: 144, maxRefreshHz: 144 },
  power: { hasBattery: false, acOnline: null, planGuid: 'x', planName: 'Balanced', powerSaver: false, usbSelectiveSuspendAc: false, usbSelectiveSuspendDc: false },
  graphics: { gpus: ['GPU'], hybrid: false, gamePreference: 'system_default' },
  network: { connected: true, adapters: [{ name: 'Ethernet', description: '', kind: 'ethernet', linkSpeed: '1 Gbps' }] },
  storage: null,
  overlays: [],
  bandwidthApps: [],
  unavailable: [],
});

const benchmark: NetworkBenchmark = { host: '1.1.1.1', sent: 8, received: 0, lossPercent: 100, minMs: null, maxMs: null, averageMs: 200, jitterMs: 30, durationMs: 1 };

describe('game optimizer evaluation', () => {
  it('applies the exact warning weights', () => {
    const report = base();
    report.accessibility.stickyKeysEnabled = true;
    report.mouse.accelerationEnabled = true;
    expect(evaluateGameOptimizer(report).score).toBe(70);
  });

  it('does not deduct null display or unknown checks', () => {
    const report = base();
    report.display = null;
    report.storage = null;
    expect(evaluateGameOptimizer(report).score).toBe(100);
    expect(evaluateGameOptimizer(report).checks.find(check => check.id === 'display_refresh')?.status).toBe('unknown');
  });

  it('hides game-specific checks until an executable is selected', () => {
    const ids = evaluateGameOptimizer(base()).checks.map(check => check.id);
    expect(ids).not.toContain('gpu_preference');
    expect(ids).not.toContain('storage_space');
    expect(ids).not.toContain('storage_type');
  });

  it('prefers ethernet when Wi-Fi is also present', () => {
    const report = base();
    report.network.adapters.push({ name: 'Wi-Fi', description: '', kind: 'wifi', linkSpeed: '866 Mbps' });
    const result = evaluateGameOptimizer(report);
    expect(result.checks.find(check => check.id === 'network_link')?.status).toBe('pass');
  });

  it('marks unavailable network data as unknown without a deduction', () => {
    const report = base();
    report.unavailable = ['network.adapters'];
    report.network.connected = false;
    const result = evaluateGameOptimizer(report);
    expect(result.checks.find(check => check.id === 'network_link')?.status).toBe('unknown');
    expect(result.score).toBe(100);
  });

  it('does not treat failed input reads as passing or deduct points', () => {
    const report = base();
    report.unavailable = ['input.accessibility', 'input.mouse'];
    report.accessibility.stickyKeysEnabled = true;
    report.mouse.accelerationEnabled = true;
    const result = evaluateGameOptimizer(report);
    expect(result.checks.find(check => check.id === 'accessibility_shortcuts')?.status).toBe('unknown');
    expect(result.checks.find(check => check.id === 'mouse_acceleration')?.status).toBe('unknown');
    expect(result.score).toBe(100);
  });

  it('warns at both low-space boundaries', () => {
    const report = base();
    report.storage = { path: 'x', drive: 'C:', freeBytes: 15 * 1024 ** 3, totalBytes: 200 * 1024 ** 3, driveType: 'ssd' };
    expect(evaluateGameOptimizer(report).checks.find(check => check.id === 'storage_space')?.status).toBe('warning');
    report.storage.freeBytes = 20 * 1024 ** 3;
    report.storage.totalBytes = 200 * 1024 ** 3;
    expect(evaluateGameOptimizer(report).checks.find(check => check.id === 'storage_space')?.status).toBe('warning');
  });

  it('reports overlays without deducting points', () => {
    const report = base();
    report.overlays = [{ id: '1', name: 'Overlay', process: 'overlay.exe' }];
    const result = evaluateGameOptimizer(report);
    expect(result.score).toBe(100);
    expect(result.checks.find(check => check.id === 'overlays')?.status).toBe('info');
    expect(result.checks.find(check => check.id === 'overlays')?.params.names).toBe('Overlay');
  });

  it('reports potential bandwidth apps without deducting points', () => {
    const report = base();
    report.bandwidthApps = [{ id: '1', name: 'Downloader', process: 'download.exe' }];
    const result = evaluateGameOptimizer(report);
    expect(result.checks.find(check => check.id === 'bandwidth_apps')?.status).toBe('info');
    expect(result.score).toBe(100);
  });

  it('clamps score to zero with many warnings and benchmark failures', () => {
    const report = base();
    report.accessibility.stickyKeysEnabled = true;
    report.mouse.accelerationEnabled = true;
    report.display!.currentRefreshHz = 60;
    report.power = { hasBattery: true, acOnline: false, planGuid: 'x', planName: 'Saver', powerSaver: true, usbSelectiveSuspendAc: true, usbSelectiveSuspendDc: true };
    report.network.connected = false;
    report.storage = { path: 'x', drive: 'E:', freeBytes: 1, totalBytes: 100, driveType: 'external' };
    report.bandwidthApps = [{ id: '1', name: 'Downloader', process: 'download.exe' }];
    expect(evaluateGameOptimizer(report, benchmark).score).toBe(0);
  });
});
