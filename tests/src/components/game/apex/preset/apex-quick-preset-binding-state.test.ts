import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL(
  '../../../../../../src/components/game/apex/preset/ApexQuickPresetDialog.vue',
  import.meta.url,
), 'utf8');

describe('Apex quick preset binding and expand states', () => {
  it('dims binding rows that are not selected', () => {
    expect(source).toContain("'preset-binding-row--disabled': !game_setting_options[binding.key]");
    expect(source).toMatch(/<kbd\s+:class="\{[\s\S]*?'preset-binding-row--disabled': !game_setting_options\[binding\.key\]/);
    expect(source).toMatch(/\.preset-binding-row kbd\.preset-binding-row--disabled\s*\{[\s\S]*?opacity:\s*0\.5;/);
    const bindingDetailsStart = source.indexOf('<div class="preset-binding-details">');
    const replacementHintStart = source.indexOf('<p class="preset-binding-replacement-hint">', bindingDetailsStart);
    const bindingDetails = source.slice(bindingDetailsStart, replacementHintStart);
    expect(bindingDetails).toContain('class="preset-binding-row"');
    expect(bindingDetails).not.toMatch(/<div\s+v-for="binding in quickPresetBindingToggles"[^>]*:class=/);
  });

  it('lets the expand transition own conditional mounting', () => {
    expect(source).toContain('<div v-if="enable_resolution_preset" class="quick-preset-section__body">');
    expect(source).toContain('<div v-if="enable_graphics_preset" class="quick-preset-graphics-body">');
    expect(source).not.toContain('v-show="enable_resolution_preset"');
    expect(source).not.toContain('v-show="enable_graphics_preset"');
  });

  it('keeps graphics expand padding inside the transition content', () => {
    expect(source).toMatch(/\.quick-preset-graphics-body\s*\{\s*min-width: 0;\s*overflow: hidden;\s*\}/);
    expect(source).toMatch(/\.quick-preset-graphics-body \.quick-preset-expand-content\s*\{[\s\S]*?padding-bottom: 10px;/);
  });

  it('keeps option and binding checkbox wrappers on the shared section baseline', () => {
    const optionWrap = source.slice(
      source.indexOf('.option-tip-wrap {'),
      source.indexOf('.quick-preset-option-list .option-tip-wrap:first-child'),
    );
    const bindingDetails = source.slice(
      source.indexOf('.preset-binding-details {'),
      source.indexOf('.preset-binding-row {'),
    );

    // Section toggles, sensitivity, video options, and binding rows all sit
    // at the section's 14px content inset; wrappers must not add a second
    // offset before Vuetify's own checkbox control box.
    expect(optionWrap).toMatch(/padding-left:\s*0;/);
    expect(bindingDetails).toMatch(/padding-left:\s*0;/);
    expect(optionWrap).not.toMatch(/padding-left:\s*2px;/);
    expect(bindingDetails).not.toMatch(/padding-left:\s*2px;/);
  });
});
