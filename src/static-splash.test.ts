import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('static startup splash', () => {
  it('is a full drag region while preventing the native context menu', () => {
    expect(indexSource).toContain('<div id="splash" data-tauri-drag-region="true">');
    expect(indexSource).toContain('#splash * { pointer-events: none; }');
    expect(indexSource).toContain("document.addEventListener('contextmenu'");
    expect(indexSource).toContain('splash.contains(event.target)');
    expect(indexSource).toContain('event.preventDefault()');
  });
});
