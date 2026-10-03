import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  new URL('../../../../src/components/common/AppUpdateDialog.vue', import.meta.url),
  'utf8',
);

describe('AppUpdateDialog contract', () => {
  it('opens for an available version and exposes signed install and release actions', () => {
    expect(source).toContain("phase === 'available'");
    expect(source).toContain("t('updates.dialogTitle')");
    expect(source).toContain('@click="install"');
    expect(source).toContain('@click="releasePage"');
    expect(source).toContain("await update.install()");
  });

  it('blocks installation while the app has unapplied work', () => {
    expect(source).toContain('downloads.unfinished > 0');
    expect(source).toContain(':disabled="blocked || update.busy"');
  });
});
