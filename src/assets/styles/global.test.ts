import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const globalCss = readFileSync(fileURLToPath(new URL('./global.css', import.meta.url)), 'utf8');

describe('global reduced-motion styles', () => {
  it('preserves the Toastification progress-bar timeout animation', () => {
    const reducedMotionStart = globalCss.indexOf('@media (prefers-reduced-motion: reduce)');
    const nextSectionStart = globalCss.indexOf('/* 全局菜单', reducedMotionStart);
    const reducedMotionCss = globalCss.slice(reducedMotionStart, nextSectionStart);

    expect(reducedMotionStart).toBeGreaterThanOrEqual(0);
    expect(nextSectionStart).toBeGreaterThan(reducedMotionStart);
    expect(reducedMotionCss).toContain('*:not(.Vue-Toastification__progress-bar)');
    expect(reducedMotionCss).toContain('animation-duration: 0.01ms !important');
  });
});

describe('global compact icon controls', () => {
  it('uses the shared 28 px compact control token', () => {
    const start = globalCss.indexOf('.mx-compact-icon-button.v-btn');
    const block = globalCss.slice(start, globalCss.indexOf('}', start) + 1);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(block).toContain('width: var(--app-control-height-compact)');
    expect(block).toContain('height: var(--app-control-height-compact) !important');
  });
});
