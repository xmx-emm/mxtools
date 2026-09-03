import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const steamSource = readFileSync(
  fileURLToPath(new URL('../../../../../../src/components/game/apex/launch/language/steam/ApexAutoDownloadLanguage.vue', import.meta.url)),
  'utf8',
);
const eaSource = readFileSync(
  fileURLToPath(new URL('../../../../../../src/components/game/apex/launch/language/ea/ApexAutoDownloadMilesLanguageEa.vue', import.meta.url)),
  'utf8',
);
const iconRegistrySource = readFileSync(
  fileURLToPath(new URL('../../../../../../src/icons/mdi-icons.ts', import.meta.url)),
  'utf8',
);

describe('Apex automatic language download dialogs', () => {
  it('renders the registered cancelled-state icon in both launcher flows', () => {
    expect(steamSource).toContain('icon="mdi-pause-circle"');
    expect(eaSource).toContain('icon="mdi-pause-circle"');
    expect(iconRegistrySource).toContain('mdiPauseCircle');
    expect(iconRegistrySource).toContain("'mdi-pause-circle': mdiPauseCircle");
  });

  it('keeps each platform’s progress phases and explicit cancellation action', () => {
    expect(steamSource).toContain("'restartingSteam'");
    expect(steamSource).toContain('cancel_miles_auto_download(stop_steam)');
    expect(eaSource).toContain("'restartingEa'");
    expect(eaSource).toContain('cancel_miles_auto_download_ea(stop_ea)');
  });
});
