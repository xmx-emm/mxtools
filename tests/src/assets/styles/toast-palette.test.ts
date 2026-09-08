import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {parse} from 'postcss';

const globalCss = readFileSync(
  fileURLToPath(new URL('../../../../src/assets/styles/global.css', import.meta.url)),
  'utf8',
);

function cssHexVariable(name: string, selector: string): string {
  let value = '';
  parse(globalCss).walkRules(selector, rule => {
    rule.walkDecls(name, declaration => { value = declaration.value; });
  });
  expect(value, `missing ${selector} ${name}`).toMatch(/^#[0-9a-f]{6}$/i);
  return value;
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
  it.each(['default', 'success', 'error', 'warning', 'info'])('keeps %s readable in both themes', type => {
    for (const selector of [':root', 'html.dark']) {
      const background = cssHexVariable(`--mx-toast-${type}-bg`, selector);
      const foreground = cssHexVariable(`--mx-toast-${type}-fg`, selector);
      const accent = cssHexVariable(`--mx-toast-${type}-accent`, selector);
      expect(contrastRatio(background, foreground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(background, accent)).toBeGreaterThanOrEqual(3);
    }
  });

  it('uses one uniform border instead of a left status stripe', () => {
    const toastCss = globalCss.slice(globalCss.indexOf('body .Vue-Toastification__container {'),
      globalCss.indexOf('/* \u5168\u5c40\u83dc\u5355'));
    expect(toastCss).not.toMatch(/border-(?:inline-start|left)\s*:/);
    expect(toastCss).toContain('border: 1px solid color-mix(');
    for (const type of ['success', 'error', 'warning', 'info']) {
      expect(toastCss).toContain(`body .Vue-Toastification__toast--${type} {`);
      expect(toastCss).toContain(`--mx-toast-accent: var(--mx-toast-${type}-accent);`);
    }
  });

  it('keeps matching icons and the progress clock without changing dismissal behavior', () => {
    expect(globalCss).toContain('color: currentColor;');
    expect(globalCss).toContain('color: var(--mx-toast-accent);');
    expect(globalCss).toContain('background-color: var(--mx-toast-accent);');
    expect(globalCss).toContain('*:not(.Vue-Toastification__progress-bar)');
    expect(globalCss).toContain('overflow-wrap: anywhere;');
  });
});
