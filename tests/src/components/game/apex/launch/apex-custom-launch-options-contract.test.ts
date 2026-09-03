import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const editorSource = readFileSync(
  fileURLToPath(new URL('../../../../../../src/components/game/apex/launch/ApexCustomLaunchOptions.vue', import.meta.url)),
  'utf8',
);
const listSource = readFileSync(
  fileURLToPath(new URL('../../../../../../src/components/game/apex/launch/ApexSelectLaunchOptions.vue', import.meta.url)),
  'utf8',
);

describe('Apex custom launch options contract', () => {
  it('uses the same compact height as the surrounding launch controls', () => {
    expect(editorSource).toContain('v-model="customLaunchOptions"');
    expect(editorSource).toContain('class="mx-compact-field"');
    expect(editorSource).not.toContain('class="mx-standard-field"');
    expect(editorSource).toContain('density="compact"');
    expect(editorSource).toContain('variant="outlined"');
    expect(editorSource).toContain('prepend-inner-icon="mdi-console"');
    expect(editorSource).toContain("customLaunchOptionsLabel");
    expect(editorSource).toContain("customLaunchOptionsPlaceholder");
    expect(editorSource).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
  });

  it('shows the editor above the list only for the animated all filter', () => {
    const editorIndex = listSource.indexOf('<ApexCustomLaunchOptions');
    const listIndex = listSource.indexOf('<v-list');

    expect(listSource).toContain("import ApexCustomLaunchOptions");
    expect(listSource).toContain('<v-expand-transition>');
    expect(listSource).toContain('v-if="apex_store.filter_type === ApexFilterEnum.all"');
    expect(editorIndex).toBeGreaterThan(-1);
    expect(listIndex).toBeGreaterThan(editorIndex);
  });

  it('animates filtered launch entries and preserves sticky category wrappers', () => {
    expect(listSource).toContain('<TransitionGroup');
    expect(listSource).toContain('name="apex-filter-list"');
    expect(listSource).toContain(':class="{\'apex-category-entry\': !isSteamLaunchOptionsImpl(item)}"');
    expect(listSource).toContain('.apex-filter-list-move,');
    expect(listSource).toContain('.apex-filter-list-enter-from,');
    expect(listSource).toMatch(
      /\.apex-category-entry\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s,
    );
  });
});
