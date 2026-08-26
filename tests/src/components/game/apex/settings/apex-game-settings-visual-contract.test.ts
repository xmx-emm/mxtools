import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../../../../src/components/game/apex/settings/ApexGameSettings.vue', import.meta.url)),
  'utf8',
);

describe('ApexGameSettings visual contract', () => {
  it('keeps the list as the only vertical scroll owner and categories horizontally reachable', () => {
    expect(source).toContain('class="settings-list flex-grow-1 min-height-0"');
    expect(source).toMatch(/\.settings-list\s*\{\s*overflow-y: auto/);
    expect(source).toContain('class="settings-sections-scroll"');
    expect(source).toMatch(/\.settings-sections-scroll\s*\{[\s\S]*?overflow-x: auto/);
    expect(source).toContain('class="settings-scroll-hint settings-scroll-hint--left"');
    expect(source).toContain('class="settings-scroll-hint settings-scroll-hint--right"');
    expect(source).toMatch(/density="compact"[\s\S]*?color="primary"[\s\S]*?variant="text"[\s\S]*?border[\s\S]*?divided[\s\S]*?class="settings-sections game-page-segmented-toggle"/);
    expect(source).toMatch(
      /class="settings-sections game-page-segmented-toggle"[\s\S]*?<v-btn[\s\S]*?v-for="item in apexGameSettingsSections"[\s\S]*?size="small"[\s\S]*?<\/v-btn>[\s\S]*?<\/v-btn-toggle>/,
    );
  });

  it('preserves editable, dual-binding, and read-only unknown row branches', () => {
    expect(source).toContain("section !== 'bindings' && section !== 'unknown'");
    expect(source).toContain("v-else-if=\"section === 'bindings'\"");
    expect(source).toContain('v-for="slot in bindingSlots"');
    expect(source).toContain('const bindingSlots = [0, 1] as const;');
    expect(source).toContain('class="binding-slots-scroll"');
    expect(source).toMatch(/\.binding-slots\s*\{[\s\S]*?repeat\(2,/);
    expect(source).toContain('class="unknown-value"');
    expect(source).toContain(':title="entry.value"');
    expect(source).toContain(':aria-label="entry.value"');
    expect(source).toContain('tabindex="0"');
  });

  it('moves appended controls below content at narrow widths without clipping enum or unknown values', () => {
    expect(source).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.v-list-item__append\)[\s\S]*?grid-row: 2/);
    expect(source).toMatch(/\.setting-enum-scroll\s*\{\s*max-width: 100%/);
    expect(source).toMatch(/\.binding-slots-scroll\s*\{\s*width: 100%/);
    expect(source).toMatch(/\.unknown-value\s*\{\s*max-width: 100%; white-space: normal; overflow-wrap: anywhere/);
  });
});
