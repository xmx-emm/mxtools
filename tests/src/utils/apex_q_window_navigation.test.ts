import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {parseApexQWindowTarget} from '@/types/apex_q.ts';

const windowsSource = readFileSync(new URL('../../../src/utils/windows.ts', import.meta.url), 'utf8');
const coordinatorSource = readFileSync(
  new URL('../../../src/composables/apex_q/useApexQDialogController.ts', import.meta.url),
  'utf8',
);
const apexQSource = readFileSync(new URL('../../../src/utils/apex_q.ts', import.meta.url), 'utf8');
const overlaySource = readFileSync(new URL('../../../src/views/ApexQOverlayView.vue', import.meta.url), 'utf8');

describe('APEX Q auxiliary-window navigation', () => {
  it('uses a deterministic route target for a newly-created workbench', () => {
    expect(parseApexQWindowTarget('ocr')).toBe('ocr');
    expect(parseApexQWindowTarget('invalid')).toBeNull();
    expect(windowsSource).toContain('url: `#/apex-q?target=${encodeURIComponent(target)}`');
    expect(coordinatorSource).toContain("new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('target')");
    expect(windowsSource).toContain('await emit(APEX_Q_WINDOW_NAVIGATE_EVENT, {target});');
  });

  it('keeps existing APEX Q and overlay windows alive', () => {
    expect(windowsSource).not.toContain('apexQRevision');
    expect(apexQSource).not.toContain('overlayRevision');
    expect(apexQSource).not.toContain('ensureOverlayWindowRev');
  });

  it('uses field-level overlay lock persistence and consumes shared preference patches', () => {
    expect(overlaySource).toContain("saveApexQPrefs(prefs, ['overlayLocked'])");
    expect(overlaySource).toContain('APEX_Q_PREFS_CHANGED_EVENT');
    expect(overlaySource).toContain('patchApexQPrefs(e.payload.prefs)');
  });
});
