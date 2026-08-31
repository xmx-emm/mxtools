import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL('../../../src/views/SettingsView.vue', import.meta.url), 'utf8');

describe('settings view category contract', () => {
  it('keeps appearance and language in a dedicated accessible tab panel', () => {
    expect(source).toContain("type SettingsTab = 'general' | 'appearance' | 'shortcuts' | 'about';");
    expect(source).toContain("{id: 'appearance' as const, title: t('settings.appearance'), icon: 'mdi-palette-outline'}");
    expect(source).toMatch(
      /v-show="activeTab === 'appearance'"[\s\S]*?id="settings-panel-appearance"[\s\S]*?aria-labelledby="settings-tab-appearance"/,
    );

    const generalPanel = source.match(
      /id="settings-panel-general"[\s\S]*?<\/div>\s*<div\s+v-show="activeTab === 'appearance'"/,
    )?.[0];
    expect(generalPanel).toBeDefined();
    expect(generalPanel).not.toContain("t('settings.appearance')");
    expect(generalPanel).not.toContain(':items="localeItems"');
    expect(generalPanel).not.toContain('<ThemeColorPicker/>');
  });

  it('uses the shared transactional locale path and blocks duplicate selections', () => {
    expect(source).toContain('setSynchronizedAppLocale');
    expect(source).toMatch(
      /async function applyLocale\(locale: LocaleCode\)[\s\S]*?localeApplying\.value = true;[\s\S]*?await setSynchronizedAppLocale\(locale\);[\s\S]*?finally \{\s*localeApplying\.value = false;/,
    );
    expect(source).toMatch(
      /:model-value="settingsStore\.locale"[\s\S]*?:loading="localeApplying"[\s\S]*?:disabled="localeApplying"[\s\S]*?@update:model-value="applyLocale"/,
    );
  });

  it('offers a localized restore-default action for the locale shortcut', () => {
    expect(source).toContain('icon="mdi-restore"');
    expect(source).toContain(":aria-label=\"t('settings.shortcutRestoreDefault')\"");
    expect(source).toContain('@click="resetToggleLocaleShortcut"');
    expect(source).toContain('settingsStore.setToggleLocaleShortcut(DEFAULT_TOGGLE_LOCALE_SHORTCUT)');
  });
});
