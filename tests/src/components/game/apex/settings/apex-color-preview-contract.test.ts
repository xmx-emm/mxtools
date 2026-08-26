import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const settingsSource = readSource('../../../../../../src/components/game/apex/settings/ApexGameSettings.vue');
const tipSource = readSource('../../../../../../src/components/game/apex/settings/ApexGameSettingTip.vue');
const laserInputSource = readSource('../../../../../../src/components/game/apex/settings/ApexLaserSightColorInput.vue');
const settingDataSource = readSource('../../../../../../src/data/apex_game_settings.ts');
const laserBackground = readFileSync(fileURLToPath(new URL(
  '../../../../../../src/assets/images/apex/laser_sight_preview.jpg',
  import.meta.url,
)));

function readJpegSize(jpeg: Buffer): {width: number, height: number} {
  let offset = 2;
  while (offset + 9 < jpeg.length) {
    if (jpeg[offset] !== 0xFF) throw new Error(`Invalid JPEG marker at offset ${offset}`);
    const marker = jpeg[offset + 1];
    const isStartOfFrame = marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker);
    if (isStartOfFrame) return {width: jpeg.readUInt16BE(offset + 7), height: jpeg.readUInt16BE(offset + 5)};
    offset += 2 + jpeg.readUInt16BE(offset + 2);
  }
  throw new Error('JPEG start-of-frame marker not found');
}

describe('Apex reticle and laser color preview contract', () => {
  it('routes the reticle and both laser setting rows through the shared right-click tip', () => {
    expect(settingsSource).toContain('@contextmenu.prevent="showSettingTip(field)"');
    expect(settingDataSource).toContain("field('reticleColor', 'profile', 'reticle_color', 'gameplay', 'rgb')");
    expect(settingDataSource).toContain("field('laserSightCustom', 'profile', 'laserSightColorCustomized', 'gameplay', 'enum'");
    expect(settingDataSource).toContain("field('laserSightColor', 'profile', 'laserSightColor', 'gameplay', 'packed-rgb'");
    expect(tipSource).toContain("field.id === 'reticleColor'");
    expect(tipSource).toContain("field.value?.id === 'laserSightCustom' || field.value?.id === 'laserSightColor'");
  });

  it('renders stored RGB values in the reticle and preview-only laser surfaces', () => {
    expect(tipSource).toContain('class="reticle-color-preview"');
    expect(tipSource).toContain("'--reticle-color': `rgb(${reticleRgb.value.join(' ')})`");
    expect(tipSource).toContain('preview-only');
    expect(laserInputSource).toContain('v-if="!previewOnly"');
    expect(laserInputSource).toContain('class="laser-beam"');
    expect(laserInputSource).toContain('class="laser-impact"');
  });

  it('bundles the 800 x 438 JPEG re-encode of the extracted Apex preview background', () => {
    expect(laserInputSource).toContain("@/assets/images/apex/laser_sight_preview.jpg");
    expect(laserBackground.readUInt16BE(0)).toBe(0xFF_D8);
    expect(readJpegSize(laserBackground)).toEqual({width: 800, height: 438});
    expect(laserBackground.length).toBeLessThan(80_000);
  });
});
