import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const globalCss = readFileSync(fileURLToPath(new URL('../../../../src/assets/styles/global.css', import.meta.url)), 'utf8');

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

  it('disables visible motion in performance mode', () => {
    const start = globalCss.indexOf('html[data-mx-performance-mode] {');
    const nextSection = globalCss.indexOf('/* 全局菜单', start);
    const performanceModeCss = globalCss.slice(start, nextSection);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(nextSection).toBeGreaterThan(start);
    expect(performanceModeCss).toContain('animation: none !important');
    expect(performanceModeCss).toContain('transition: none !important');
    expect(performanceModeCss).toContain('*:not(.Vue-Toastification__progress-bar)');
    expect(performanceModeCss).toContain('.Vue-Toastification__progress-bar');
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

describe('global compact radius contract', () => {
  it('keeps the small semantic radius at 4 px without changing larger tiers', () => {
    expect(globalCss).toMatch(/--app-radius-sm:\s*4px;/);
    expect(globalCss).toMatch(/--app-radius-md:\s*8px;/);
    expect(globalCss).toMatch(/--app-radius-lg:\s*8px;/);
  });

  it('lets compact segmented controls inherit the shared small radius', () => {
    const start = globalCss.indexOf('.game-page-segmented-toggle {');
    const block = globalCss.slice(start, globalCss.indexOf('}', start) + 1);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(block).toContain('height: var(--game-page-control-height) !important');
    expect(globalCss).toContain('.game-page-segmented-toggle .v-btn');
    expect(globalCss).toContain('border-radius: var(--app-radius-sm)');
  });
});
