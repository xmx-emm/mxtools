import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../../../../src/components/game/apex/preset/ApexConfigExportDialog.vue', import.meta.url)),
  'utf8',
);

describe('Apex config export visual contract', () => {
  it('renders the device-specific exclusion as low-emphasis helper text', () => {
    expect(source).toContain('class="config-export-device-note"');
    expect(source).toContain('mdi-information-outline');
    expect(source).not.toContain('type="info"');
    expect(source).toMatch(/\.config-export-device-note\s*\{[\s\S]*font-size: 10\.5px/);
    expect(source).toMatch(/color: rgba\(var\(--v-theme-on-surface\), 0\.5\)/);
  });

  it('shows the actual item count beside every export block', () => {
    expect(source.match(/class="config-export-option-label"/g)).toHaveLength(6);
    expect(source).toContain("exportItemCount', {count: launch_count}");
    expect(source).toContain("exportItemCount', {count: aiming_count}");
    expect(source).toContain("exportItemCount', {count: controller_count}");
    expect(source).toContain("exportItemCount', {count: game_settings_count}");
    expect(source).toContain("exportItemCount', {count: bindings_count}");
    expect(source).toContain("exportItemCount', {count: video_count}");
  });
});
