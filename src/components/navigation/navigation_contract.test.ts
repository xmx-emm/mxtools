import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const navigation = readFileSync(
  fileURLToPath(new URL('../Navigation.vue', import.meta.url)),
  'utf8',
);

describe('shared navigation visual contract', () => {
  it('keeps secondary navigation items compact like primary navigation', () => {
    expect(navigation).toContain(
      '<v-list density="compact" nav class="py-2 nav-list nav-list--secondary">',
    );
  });

  it('reveals labels continuously without moving footer or header anchors', () => {
    expect(navigation).toContain("'--nav-label-opacity': progress.toFixed(3)");
    expect(navigation).toMatch(
      /\.nav-tool-item :deep\(\.v-list-item__content\),\s*\.nav-brand-item :deep\(\.v-list-item__content\) \{[^}]*opacity: var\(--nav-label-opacity, 1\)/s,
    );
    expect(navigation).not.toContain('visibility: hidden');
    expect(navigation).toContain('grid-template-columns: 24px minmax(0, 1fr)');
    expect(navigation).toContain('class="nav-leading-slot flex-shrink-0"');
    expect(navigation).toContain("'--nav-root-marker-opacity': markerOpacity.toFixed(3)");
    expect(navigation).toContain("'--nav-header-label-opacity': headerOpacity.toFixed(3)");
    expect(navigation).toContain('opacity: var(--nav-root-marker-opacity, 0)');
    expect(navigation).toContain('function renderedMaxLabelWidth(panel: HTMLElement)');
    expect(navigation).toContain('navPanelExpandedWidth(');
    expect(navigation).toContain('[primaryMeasurementKey, secondaryMeasurementKey]');
    expect(navigation).toMatch(/\.nav-version \{\s*width: 40px;\s*max-width: 40px;/);
  });

  it('animates page selection and uses the softer shared snap easing', () => {
    expect(navigation).toContain(
      'transition: width var(--app-motion-slow) var(--app-ease-standard)',
    );
    expect(navigation).toMatch(/\.nav-tool-item::before \{[^}]*opacity: 0;/s);
    expect(navigation).toMatch(/\.nav-tool-item-active::before \{[^}]*opacity: 0\.3;/s);
    expect(navigation).not.toContain('translateX(2px) scale(1.04)');
    expect(navigation).toMatch(
      /\.nav-tool-item:hover:not\(\.nav-tool-item-active\) :deep\(\.v-icon\) \{\s*transform: scale\(1\.04\);/,
    );
    expect(navigation).toContain(
      'animation: nav-icon-hover-scale var(--app-motion-base) var(--app-ease-emphasized) both',
    );
    expect(navigation).toMatch(/@keyframes nav-icon-hover-scale \{[^}]*transform: scale\(1\)/s);
    expect(navigation).toMatch(
      /\.nav-back-button--hidden \{[^}]*transform: rotate\(-90deg\) scale\(0\.86\)/s,
    );
  });

  it('animates the secondary navigation shell when routes add or remove it', () => {
    expect(navigation).toContain('<Transition name="nav-secondary-shell">');
    expect(navigation).toContain(
      "'--nav-secondary-shell-width': `${secondaryWidth.value + 1}px`",
    );
    expect(navigation).toMatch(
      /\.nav-secondary-shell \{[^}]*flex: 0 0 var\(--nav-secondary-shell-width\);[^}]*width: var\(--nav-secondary-shell-width\);[^}]*width var\(--app-motion-slow\) var\(--app-ease-standard\),[^}]*flex-basis var\(--app-motion-slow\) var\(--app-ease-standard\),[^}]*opacity var\(--app-motion-base\) var\(--app-ease-standard\);/s,
    );
    expect(navigation).toMatch(
      /\.nav-secondary-shell-enter-from,\s*\.nav-secondary-shell-leave-to \{\s*width: 0;\s*flex-basis: 0;\s*opacity: 0;/,
    );
  });

  it('keeps the settings entry as a semantic router link', () => {
    expect(navigation).toMatch(
      /prepend-icon="mdi-cog"\s+to="\/settings"/,
    );
    expect(navigation).not.toContain('@click="router.push(\'/settings\')"');
  });

  it('keeps Beta guidance separate from the tool name', () => {
    expect(navigation).toContain(':text="$t(item.nameKey)"');
    expect(navigation).toContain(':title="$t(item.nameKey)"');
    expect(navigation).not.toContain("`${$t(item.nameKey)} · ${$t('settings.betaFeaturesHint')}`");
    expect(navigation).toContain(":class=\"{'nav-child-item--beta': item.beta}\"");
  });

  it('smoothly aligns the home hit area with its visible border', () => {
    expect(navigation).toMatch(
      /\.nav-brand-mark \{[^}]*width: 40px;[^}]*height: 40px;[^}]*box-sizing: border-box;/s,
    );
    expect(navigation).toContain(
      "'--nav-brand-height': `${(40 + 14 * progress).toFixed(2)}px`",
    );
    expect(navigation).toMatch(
      /\.nav-brand-item \{[^}]*min-height: var\(--nav-brand-height, 54px\);[^}]*height: var\(--nav-brand-height, 54px\);[^}]*min-height var\(--app-motion-slow\) var\(--app-ease-standard\),[^}]*height var\(--app-motion-slow\) var\(--app-ease-standard\);/s,
    );
    expect(navigation).toMatch(
      /\.nav-panel--collapsed \.nav-brand-item \{\s*padding: 0 8px 0 0 !important;/,
    );
    expect(navigation).toMatch(/\.nav-panel--dragging \.nav-brand-item \{\s*transition: none;/);
  });
});
