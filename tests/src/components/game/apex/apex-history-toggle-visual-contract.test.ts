import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../../../src/components/game/apex/history/ApexConfigHistoryDialog.vue', import.meta.url)),
  'utf8',
);

describe('Apex history toggle visual contract', () => {
  it('keeps the history view toggle compact with small child buttons', () => {
    const toggle = source.match(
      /<v-btn-toggle[\s\S]*class="game-page-segmented-toggle"[\s\S]*<\/v-btn-toggle>/,
    )?.[0];
    expect(toggle).toBeDefined();
    expect(toggle).toContain('density="compact"');
    expect(toggle).toContain('color="primary"');
    expect(toggle).toContain('variant="text"');
    expect(toggle).toContain('border');
    expect(toggle).toContain('divided');
    expect(toggle).toMatch(/<v-btn[^>]*value="current"[^>]*size="small"/);
    expect(toggle).toMatch(/<v-btn[^>]*value="all"[^>]*size="small"/);
  });

  it('gives the icon-only refresh action a localized accessible name', () => {
    const refresh = source.match(/<v-btn[\s\S]*?icon="mdi-refresh"[\s\S]*?\/>/)?.[0];
    expect(refresh).toBeDefined();
    expect(refresh).toContain(':aria-label="t(\'apex.history.refresh\')"');
    expect(refresh).toContain(':title="t(\'apex.history.refresh\')"');
    expect(refresh).toContain(':loading="apexStore.is_config_history_loading"');
  });

  it('keeps history rows readable with restrained hierarchy', () => {
    expect(source).toContain('class="history-source"');
    expect(source).toContain('class="history-meta"');
    expect(source).toContain('class="history-summary"');
    expect(source).toMatch(/\.history-source\s*\{[^}]*font-size: 13px/);
  });
});
