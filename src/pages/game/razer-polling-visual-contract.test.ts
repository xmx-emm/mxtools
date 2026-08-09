import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const pageSource = readFileSync(
  new URL('./RazerPollingPage.vue', import.meta.url),
  'utf8',
);
const controlSource = readFileSync(
  new URL('../../components/game/razer/RazerPollingRateControl.vue', import.meta.url),
  'utf8',
);
const autostartSource = readFileSync(
  new URL('../../components/settings/BackgroundAutostartSwitch.vue', import.meta.url),
  'utf8',
);
const mainSource = readFileSync(
  new URL('../../main.ts', import.meta.url),
  'utf8',
);
const configSource = readFileSync(
  new URL('../../utils/razer_polling_config.ts', import.meta.url),
  'utf8',
);

describe('Razer polling page visual contract', () => {
  it('uses an independent Beta page shell with one scroll owner', () => {
    expect(pageSource).toContain('class="app-page razer-polling-page"');
    expect(pageSource).toContain('class="app-page__header razer-page-header"');
    expect(pageSource.match(/class="app-page__scroll"/g)).toHaveLength(1);
    expect(pageSource).toContain('class="app-page__content razer-page-content"');
    expect(pageSource).toContain('class="mx-beta-badge"');
    expect(pageSource).toContain(':title="t(\'settings.betaFeaturesHint\')"');
    expect(pageSource).toContain("{{ t('common.beta') }}");
    expect(pageSource).not.toContain('gameOptimizer.');
  });

  it('covers zero, one, and multiple connected-device presentation branches', () => {
    expect(controlSource).toContain(
      'const connected = computed(() => props.statuses.filter(status => status.available))',
    );
    expect(controlSource).toContain('?? connected.value[0] ?? null');
    expect(controlSource).toContain('v-if="connected.length > 1"');
    expect(controlSource).toContain('<template v-if="selected">');
    expect(controlSource).toContain('<span v-else>{{ t(\'razerPolling.notFound\') }}</span>');
    expect(controlSource).toContain(
      '<p v-else class="razer-device__empty">{{ t(\'razerPolling.notFoundHint\') }}</p>',
    );
    expect(pageSource).toContain(':statuses="statuses"');
    expect(pageSource).toContain(':selected-device-id="selectedDeviceId"');
    expect(pageSource).toContain('@select-device="selectedDeviceId = $event"');
  });

  it('uses one atomic runtime update while keeping direct device actions explicit', () => {
    expect(pageSource).toContain(
      "import {cloneRazerBackgroundConfig} from '@/utils/background_runtime.ts'",
    );
    expect(pageSource).toContain(
      'runtime.configureRazer(cloneRazerBackgroundConfig(config.value))',
    );
    expect(pageSource).toContain(
      'config.value = cloneRazerBackgroundConfig(runtime.snapshot.config.razer)',
    );
    expect(pageSource).not.toContain('structuredClone(config.value)');
    expect(pageSource).not.toContain('structuredClone(runtime.snapshot.config.razer)');
    expect(pageSource).toContain('statuses.value = result.statuses');
    expect(pageSource).not.toContain('configureRazerPolling');
    expect(pageSource).not.toContain('buildNativeRazerConfig');
    expect(pageSource).toContain('setRazerPollingRate(deviceId, rateHz)');
    expect(pageSource).toContain('restoreRazerPollingRate(deviceId)');
    expect(pageSource).toContain('verifyRazerPollingCapabilities(deviceId)');
  });

  it('separates commonly scanned shooters from optional other games', () => {
    expect(pageSource).toContain('scanReport.value = await scanInstalledGames()');
    expect(pageSource).toContain(
      'for (const game of scanReport.value.games.filter(item => item.isShooter))',
    );
    expect(configSource).toContain('export function scannedGameMatchers(');
    expect(configSource).toContain("matcher.kind === 'executablePath'");
    expect(configSource).toContain('{executable: matcher.value, packageFamilyName: null');
    expect(configSource).toContain('{executable: null, packageFamilyName: matcher.value');
    expect(pageSource).toContain('.filter(game => !game.isShooter');
    expect(pageSource).toContain('!configuredIds.value.has(game.logicalId)');
    expect(pageSource).toContain('v-for="game in config.games"');
    expect(pageSource).toContain('v-if="scanReport" class="razer-scan-results"');
    expect(pageSource).toContain('v-for="game in otherGames"');
    expect(pageSource).toContain('@click="addScannedGame(game)"');
    expect(pageSource).toContain("t('razerPolling.otherGames', {count: otherGames.length})");
  });

  it('supports multiple distinct executables in a manual profile', () => {
    expect(pageSource).toContain('const manualExecutables = ref<string[]>([])');
    expect(pageSource).toContain('v-for="(path, index) in manualExecutables"');
    expect(pageSource).toContain('@click="manualExecutables.splice(index, 1)"');
    expect(pageSource).toContain(
      'config.value.games.push(createManualGame(id, name, manualExecutables.value, statuses.value))',
    );
    expect(pageSource).toContain(':disabled="!manualName.trim() || !manualExecutables.length"');
    expect(configSource).toContain('export function createManualGame(');
    expect(configSource).toContain('const seen = new Set<string>()');
    expect(configSource).toContain('const key = path.trim().toLocaleLowerCase()');
    expect(configSource).toContain('if (!key || seen.has(key)) return false');
    expect(configSource).toContain('matchers: paths.map(executable => ({');
  });

  it('does not let a later scan overwrite a user-edited profile', () => {
    expect(configSource).toContain('if (existing?.userEdited) return false');
    expect(configSource).toContain('const deviceRatesHz = {...existing?.deviceRatesHz}');
    expect(configSource).toContain('userEdited,');
    expect(configSource).toContain('userEdited: true');
    expect(pageSource).toContain('addOrRefreshScannedGame(game, false)');
    expect(pageSource).toContain('addOrRefreshScannedGame(game, true)');
    expect(pageSource).toContain('game.userEdited = true');
    expect(pageSource).toContain(
      '@update:model-value="game.enabled = $event ?? false; markGameEdited(game)"',
    );
    expect(pageSource).toContain('markGameEdited(game)');
  });

  it('keeps the executable action in the second grid column on narrow layouts', () => {
    expect(pageSource).toContain('class="razer-game-executable"');
    expect(pageSource).toMatch(
      /@container workspace \(max-width: 680px\) \{[\s\S]*?\.razer-game-executable \{[^}]*grid-column: 2;/,
    );
  });

  it('reuses the shared background autostart control and runtime store', () => {
    expect(pageSource).toContain(
      "import BackgroundAutostartSwitch from '@/components/settings/BackgroundAutostartSwitch.vue'",
    );
    expect(pageSource).toContain('<div class="razer-autostart-row">');
    expect(pageSource).toContain('<BackgroundAutostartSwitch compact />');
    expect(pageSource).toMatch(
      /\.razer-autostart-row \{ border-top: 1px solid var\(--app-border\); \}/,
    );
    expect(pageSource).toMatch(
      /\.razer-autostart-row :deep\(\.background-autostart--compact\) \{[^}]*padding: 8px 16px;[^}]*box-sizing: border-box;/,
    );
    expect(autostartSource).toContain('const runtime = useBackgroundRuntimeStore()');
    expect(autostartSource).toContain(':model-value="runtime.autostartEnabled"');
    expect(autostartSource).toContain('await runtime.setAutostart(value)');
    expect(autostartSource).toContain(':disabled="!runtime.autostartSupported');
  });

  it('keeps native scanning and executable picking idle in browser preview', () => {
    expect(pageSource).toContain('Boolean((window as TauriRuntimeWindow).__TAURI_INTERNALS__)');
    expect(pageSource).toMatch(
      /async function scanGames\(\) \{\s*if \(!isTauriRuntime \|\| scanning\.value\) return;/s,
    );
    expect(pageSource).toMatch(
      /async function chooseExecutable\(\) \{\s*if \(!isTauriRuntime\) return null;/s,
    );
    expect(pageSource).toMatch(/onMounted\(async \(\) => \{\s*if \(!isTauriRuntime\) return;/s);
  });

  it('confirms existing dirty game edits before destroying the main window', () => {
    const closeStart = mainSource.indexOf('async function installMainCloseCoordinator()');
    const closeEnd = mainSource.indexOf('\nif (isTauriRuntime)', closeStart);
    const closeCoordinator = mainSource.slice(closeStart, closeEnd);

    expect(closeStart).toBeGreaterThanOrEqual(0);
    expect(closeEnd).toBeGreaterThan(closeStart);
    expect(closeCoordinator).toContain("listen('main-close-to-background-request'");
    expect(closeCoordinator).toContain('apex.is_launch_options_modified');
    expect(closeCoordinator).toContain('apex.is_video_config_modified');
    expect(closeCoordinator).toContain('apex.is_game_settings_modified');
    expect(closeCoordinator).toContain('pubg.is_launch_options_modified');
    expect(closeCoordinator).toContain("confirm(i18n.global.t('settings.closeWithPendingChanges')");
    expect(closeCoordinator).toContain('if (!accepted) return');
    expect(closeCoordinator.indexOf('if (dirty)')).toBeLessThan(
      closeCoordinator.indexOf('await destroyMainWindow()'),
    );
  });
});
