import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL('./ContextMenuManager.vue', import.meta.url), 'utf8');

describe('context menu manager visual contract', () => {
  it('keeps search and scope filters on the shared compact field geometry', () => {
    expect(source).toContain('class="mx-search-field search-field"');
    expect(source).toContain('class="mx-compact-field scope-field"');
    expect(source).toContain(':aria-label="t(\'explorer.contextMenu.scopeAll\')"');
  });

  it('keeps refresh compact, rounded to the shared radius, and announced accessibly', () => {
    expect(source).toContain('class="context-menu-refresh-action"');
    expect(source).toContain(':aria-label="t(\'common.refresh\')"');
    expect(source).not.toContain('rounded="lg"');
    expect(source).toMatch(/\.context-menu-refresh-action\.v-btn \{[\s\S]*var\(--app-control-height-compact\)/);
  });
});
