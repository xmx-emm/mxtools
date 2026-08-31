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
  it('uses a standard editable field with the registered console icon', () => {
    expect(editorSource).toContain('v-model="customLaunchOptions"');
    expect(editorSource).toContain('class="mx-standard-field"');
    expect(editorSource).toContain('density="compact"');
    expect(editorSource).toContain('variant="outlined"');
    expect(editorSource).toContain('prepend-inner-icon="mdi-console"');
    expect(editorSource).toContain("customLaunchOptionsLabel");
    expect(editorSource).toContain("customLaunchOptionsPlaceholder");
    expect(editorSource).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
  });

  it('keeps the editor above the scrollable launch-option list', () => {
    const editorIndex = listSource.indexOf('<ApexCustomLaunchOptions/>');
    const listIndex = listSource.indexOf('<v-list');

    expect(listSource).toContain("import ApexCustomLaunchOptions");
    expect(editorIndex).toBeGreaterThan(-1);
    expect(listIndex).toBeGreaterThan(editorIndex);
  });
});
