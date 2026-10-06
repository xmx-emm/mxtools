import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const launchSource = readFileSync(
  fileURLToPath(new URL('../../../../../../src/components/game/apex/launch/ApexSelectLaunchOptions.vue', import.meta.url)),
  'utf8',
);

describe('Apex FPS cap input contract', () => {
  it('renders the numeric input for the current +fps_max cap setting', () => {
    expect(launchSource).toContain("value.includes('+fps_max X')");
    expect(launchSource).toContain(
      'v-if="isFpsCapSetting(apex_store.settings_config[item.identifier])"',
    );
    expect(launchSource).toContain('+fps_max {{ String(apex_store.fps) }}');
    expect(launchSource).not.toContain("=== '-freq X +fps_max X'");
    expect(launchSource).not.toContain('-freq {{ String(apex_store.fps) }}');
  });

  it('keeps the FPS selector compact and separates it from the numeric input', () => {
    expect(launchSource).toContain("'apex-fps-toggle': item.identifier === 'fps'");
    expect(launchSource).toContain('class="d-flex apex-fps-input"');
    expect(launchSource).toContain('margin-inline-start: 6px');
    expect(launchSource).toContain('height: var(--game-page-control-height) !important');
    expect(launchSource).toContain('line-height: 1.2 !important');
    expect(launchSource).toContain('.apex-fps-toggle .v-btn--active:hover > .v-btn__overlay');
    expect(launchSource).toContain('opacity: var(--v-activated-opacity) !important');
    expect(launchSource).toContain('.v-list-item--active:hover > .v-list-item__overlay');
  });
});
