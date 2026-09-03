import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const globalCss = readFileSync(
  fileURLToPath(new URL('../../../../src/assets/styles/global.css', import.meta.url)),
  'utf8',
);

function cssHexVariable(name: string): string {
  const match = globalCss.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6});`, 'i'));
  expect(match, `missing ${name}`).not.toBeNull();
  return match?.[1] ?? '#000000';
}

function relativeLuminance(hex: string): number {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map(value => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }) ?? [0, 0, 0];
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(left: string, right: string): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  return (Math.max(leftLuminance, rightLuminance) + 0.05)
    / (Math.min(leftLuminance, rightLuminance) + 0.05);
}

describe('Toastification semantic palette', () => {
  it('uses readable orange warning and pale-blue info surfaces', () => {
    const warningBackground = cssHexVariable('--mx-toast-warning-bg');
    const warningForeground = cssHexVariable('--mx-toast-warning-fg');
    const infoBackground = cssHexVariable('--mx-toast-info-bg');
    const infoForeground = cssHexVariable('--mx-toast-info-fg');

    expect(warningBackground.toLowerCase()).not.toBe('#ffc107');
    expect(infoBackground.toLowerCase()).not.toBe('#2196f3');
    expect(contrastRatio(warningBackground, warningForeground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(infoBackground, infoForeground)).toBeGreaterThanOrEqual(4.5);
  });

  it('applies matching foregrounds to close buttons and progress bars', () => {
    expect(globalCss).toContain('body .Vue-Toastification__toast--warning {');
    expect(globalCss).toContain('body .Vue-Toastification__toast--info {');
    expect(globalCss).toContain('color: currentColor;');
    expect(globalCss).toContain('var(--mx-toast-warning-progress)');
    expect(globalCss).toContain('var(--mx-toast-info-progress)');
  });
});
