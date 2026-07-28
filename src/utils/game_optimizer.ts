import type {
  CheckStatus,
  GameOptimizerCheck,
  GameOptimizerEvaluation,
  GameOptimizerReport,
  NetworkBenchmark,
} from '@/types/game_optimizer.ts';

const GIB = 1024 ** 3;

function check(
  id: string,
  category: GameOptimizerCheck['category'],
  status: GameOptimizerCheck['status'],
  weight: number,
  titleKey: string,
  detailKey: string,
  params: Record<string, string | number | boolean> = {},
  actionId?: string,
  settingsUri?: string,
): GameOptimizerCheck {
  return {
    id,
    category,
    status,
    weight,
    titleKey,
    detailKey,
    params,
    ...(actionId ? {actionId} : {}),
    ...(settingsUri ? {settingsUri} : {}),
  };
}

function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function oneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

export function evaluateGameOptimizer(
  report: GameOptimizerReport,
  benchmark?: NetworkBenchmark | null,
): GameOptimizerEvaluation {
  const checks: GameOptimizerCheck[] = [];
  const accessibility = report.accessibility;
  const accessibilityEnabled =
    accessibility.stickyKeysEnabled ||
    accessibility.stickyKeysHotkeyEnabled ||
    accessibility.filterKeysEnabled ||
    accessibility.filterKeysHotkeyEnabled ||
    accessibility.toggleKeysEnabled ||
    accessibility.toggleKeysHotkeyEnabled ||
    accessibility.mouseKeysEnabled ||
    accessibility.mouseKeysHotkeyEnabled;
  const accessibilityUnavailable = report.unavailable.includes('input.accessibility');

  checks.push(check(
    'accessibility_shortcuts',
    'input',
    accessibilityUnavailable ? 'unknown' : accessibilityEnabled ? 'warning' : 'pass',
    14,
    'gameOptimizer.checks.accessibility.title',
    'gameOptimizer.checks.accessibility.detail',
    {},
    !accessibilityUnavailable && accessibilityEnabled ? 'accessibility_shortcuts' : undefined,
    'ms-settings:easeofaccess-keyboard',
  ));

  const mouseUnavailable = report.unavailable.includes('input.mouse');
  checks.push(check(
    'mouse_acceleration',
    'input',
    mouseUnavailable ? 'unknown' : report.mouse.accelerationEnabled ? 'warning' : 'pass',
    16,
    'gameOptimizer.checks.mouse.title',
    'gameOptimizer.checks.mouse.detail',
    {
      threshold1: report.mouse.threshold1,
      threshold2: report.mouse.threshold2,
      acceleration: report.mouse.acceleration,
    },
    !mouseUnavailable && report.mouse.accelerationEnabled ? 'mouse_acceleration' : undefined,
    'ms-settings:mousetouch',
  ));

  const display = report.display;
  const refreshUnknown = !display || display.maxRefreshHz <= 0 || display.currentRefreshHz <= 0;
  checks.push(check(
    'display_refresh',
    'display',
    refreshUnknown
      ? 'unknown'
      : display.currentRefreshHz >= display.maxRefreshHz ? 'pass' : 'warning',
    14,
    'gameOptimizer.checks.refresh.title',
    'gameOptimizer.checks.refresh.detail',
    {
      current: display?.currentRefreshHz ?? 0,
      maximum: display?.maxRefreshHz ?? 0,
    },
    undefined,
    'ms-settings:display-advanced',
  ));

  if (report.power.hasBattery) {
    checks.push(check(
      'ac_power',
      'power',
      report.power.acOnline === null ? 'unknown' : report.power.acOnline ? 'pass' : 'warning',
      10,
      'gameOptimizer.checks.ac.title',
      'gameOptimizer.checks.ac.detail',
      {},
      undefined,
      'ms-settings:batterysaver',
    ));
  }

  const powerPlanKnown = report.power.planGuid !== null || report.power.planName !== null;
  checks.push(check(
    'power_plan',
    'power',
    !powerPlanKnown ? 'unknown' : report.power.powerSaver ? 'warning' : 'pass',
    8,
    'gameOptimizer.checks.powerPlan.title',
    'gameOptimizer.checks.powerPlan.detail',
    {plan: report.power.planName ?? report.power.planGuid ?? ''},
    undefined,
    'ms-settings:powersleep',
  ));

  const usbEnabled = report.power.usbSelectiveSuspendAc;
  checks.push(check(
    'usb_selective_suspend',
    'power',
    usbEnabled === null ? 'unknown' : usbEnabled ? 'warning' : 'pass',
    6,
    'gameOptimizer.checks.usb.title',
    'gameOptimizer.checks.usb.detail',
    {},
    usbEnabled ? 'usb_selective_suspend' : undefined,
    'ms-settings:usb',
  ));

  checks.push(check(
    'peripheral_power',
    'power',
    'info',
    0,
    'gameOptimizer.checks.peripheralPower.title',
    'gameOptimizer.checks.peripheralPower.detail',
    {},
    undefined,
    'ms-settings:bluetooth',
  ));

  if (report.storage) {
    const gpuStatus: CheckStatus = !report.graphics.hybrid
      ? 'info'
      : report.graphics.gamePreference === 'high_performance' ? 'pass' : 'warning';
    checks.push(check(
      'gpu_preference',
      'graphics',
      gpuStatus,
      10,
      'gameOptimizer.checks.gpu.title',
      'gameOptimizer.checks.gpu.detail',
      {preference: report.graphics.gamePreference},
      undefined,
      'ms-settings:display-advancedgraphics',
    ));
  }

  const networkUnavailable = report.unavailable.some(
    item => item === 'network' || item === 'network.adapters',
  );
  const hasEthernet = report.network.adapters.some(adapter => adapter.kind === 'ethernet');
  const hasWifi = report.network.adapters.some(adapter => adapter.kind === 'wifi');
  let networkStatus: CheckStatus;
  if (networkUnavailable) {
    networkStatus = 'unknown';
  } else if (!report.network.connected) {
    networkStatus = 'warning';
  } else if (hasEthernet) {
    networkStatus = 'pass';
  } else if (hasWifi) {
    networkStatus = 'warning';
  } else {
    networkStatus = 'info';
  }
  checks.push(check(
    'network_link',
    'network',
    networkStatus,
    4,
    'gameOptimizer.checks.network.title',
    'gameOptimizer.checks.network.detail',
  ));

  if (benchmark) {
    checks.push(check(
      'network_loss',
      'network',
      benchmark.lossPercent > 0 ? 'warning' : 'pass',
      8,
      'gameOptimizer.checks.loss.title',
      'gameOptimizer.checks.loss.detail',
      {loss: oneDecimal(benchmark.lossPercent)},
    ));
    checks.push(check(
      'network_jitter',
      'network',
      benchmark.jitterMs === null
        ? 'unknown'
        : benchmark.jitterMs > 10 ? 'warning' : 'pass',
      6,
      'gameOptimizer.checks.jitter.title',
      'gameOptimizer.checks.jitter.detail',
      {jitter: benchmark.jitterMs === null ? 0 : oneDecimal(benchmark.jitterMs)},
    ));
    checks.push(check(
      'network_latency',
      'network',
      benchmark.averageMs === null
        ? 'unknown'
        : benchmark.averageMs > 80 ? 'warning' : 'pass',
      4,
      'gameOptimizer.checks.latency.title',
      'gameOptimizer.checks.latency.detail',
      {latency: benchmark.averageMs === null ? 0 : oneDecimal(benchmark.averageMs)},
    ));
  }

  if (report.storage) {
    const totalKnown = report.storage.totalBytes > 0;
    const freeRatio = totalKnown ? report.storage.freeBytes / report.storage.totalBytes : null;
    const lowSpace = totalKnown && (
      report.storage.freeBytes <= 15 * GIB || (freeRatio !== null && freeRatio <= 0.1)
    );
    checks.push(check(
      'storage_space',
      'storage',
      !totalKnown ? 'unknown' : lowSpace ? 'warning' : 'pass',
      8,
      'gameOptimizer.checks.space.title',
      'gameOptimizer.checks.space.detail',
      {
        freeGiB: oneDecimal(report.storage.freeBytes / GIB),
        totalGiB: oneDecimal(report.storage.totalBytes / GIB),
      },
    ));

    const storageType = report.storage.driveType;
    checks.push(check(
      'storage_type',
      'storage',
      storageType === 'external'
        ? 'warning'
        : storageType === 'ssd' ? 'pass' : storageType === 'hdd' ? 'info' : 'unknown',
      5,
      'gameOptimizer.checks.storageType.title',
      'gameOptimizer.checks.storageType.detail',
      {drive: report.storage.drive, type: storageType},
    ));
  }

  const overlayNames = report.overlays.map(item => item.name).join(', ') || '-';
  checks.push(check(
    'overlays',
    'software',
    report.overlays.length ? 'info' : 'pass',
    0,
    'gameOptimizer.checks.overlays.title',
    'gameOptimizer.checks.overlays.detail',
    {names: overlayNames},
  ));

  const bandwidthNames = report.bandwidthApps.map(item => item.name).join(', ') || '-';
  checks.push(check(
    'bandwidth_apps',
    'software',
    report.bandwidthApps.length ? 'info' : 'pass',
    0,
    'gameOptimizer.checks.bandwidth.title',
    'gameOptimizer.checks.bandwidth.detail',
    {count: report.bandwidthApps.length, names: bandwidthNames},
  ));

  const deduction = checks
    .filter(item => item.status === 'warning')
    .reduce((total, item) => total + item.weight, 0);

  return {
    score: clampScore(100 - deduction),
    checks,
    warningCount: checks.filter(item => item.status === 'warning').length,
    passCount: checks.filter(item => item.status === 'pass').length,
    actionableCount: checks.filter(item => item.status === 'warning' && item.actionId).length,
  };
}
