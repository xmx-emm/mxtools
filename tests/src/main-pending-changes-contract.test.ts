import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const mainSource = readFileSync(
  new URL('../../src/main.ts', import.meta.url),
  'utf8',
);

describe('main-window pending game changes workflow', () => {
  it('offers navigation before destroying a main window with dirty game edits', () => {
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
    expect(closeCoordinator).toContain("actionText: i18n.global.t('settings.reviewPendingChanges')");
    expect(closeCoordinator).toContain('onAction: () => navigateToPendingChanges({apex, pubg})');
    expect(closeCoordinator).toContain('if (!accepted) return');
    expect(closeCoordinator.indexOf('if (dirty)')).toBeLessThan(
      closeCoordinator.indexOf('await destroyMainWindow()'),
    );
  });

  it('routes to each editable game scope and selects the matching Apex tab', () => {
    expect(mainSource).toContain('resolvePendingGameChangesTarget({');
    expect(mainSource).toContain('currentPath: router.currentRoute.value.path');
    expect(mainSource).toContain('stores.apex.set_page_type(target.page)');
    expect(mainSource).toContain('await router.push(target.path)');
  });
});
