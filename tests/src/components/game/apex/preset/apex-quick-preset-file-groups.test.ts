import {readFileSync} from 'node:fs';
import {NodeTypes, type ElementNode, type TemplateChildNode} from '@vue/compiler-dom';
import {parse} from '@vue/compiler-sfc';
import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL(
  '../../../../../../src/components/game/apex/preset/ApexQuickPresetDialog.vue',
  import.meta.url,
), 'utf8');
const {descriptor} = parse(source);

function elements(nodes: TemplateChildNode[]): ElementNode[] {
  return nodes.flatMap(node => node.type === NodeTypes.ELEMENT
    ? [node, ...elements(node.children)]
    : []);
}

function attribute(node: ElementNode, name: string): string | undefined {
  const prop = node.props.find(prop => prop.type === NodeTypes.ATTRIBUTE && prop.name === name);
  return prop?.type === NodeTypes.ATTRIBUTE ? prop.value?.content : undefined;
}

const nodes = elements(descriptor.template!.ast!.children);
const groups = nodes.filter(node => attribute(node, 'data-config-scope'));

function groupSource(scope: string): string {
  const group = groups.find(node => attribute(node, 'data-config-scope') === scope);
  expect(group, `Missing config group: ${scope}`).toBeDefined();
  return group!.loc.source;
}

describe('Apex quick preset file groups', () => {
  it('separates all write targets and identifies the shared resolution control', () => {
    expect(groups.map(node => attribute(node, 'data-config-scope'))).toEqual([
      'launch video', 'launch', 'video', 'profile', 'settings',
    ]);

    const resolution = groupSource('launch video');
    expect(resolution).toContain('v-model="enable_resolution_preset"');
    expect(resolution).toContain('v-model="aspect_value"');
    expect(resolution).toContain('v-model="lock_axis"');
    expect(resolution).toContain('{{ launch_config_file }} + videoconfig.txt');
  });

  it('groups FPS and reticle with launch options, and graphics with video options', () => {
    const launch = groupSource('launch');
    expect(launch).toContain('{{ launch_config_file }}');
    expect(launch).toContain('v-model="fps_cap"');
    expect(launch).toContain('v-model="simplified_reticle"');
    expect(launch).toContain('v-for="opt in quickPresetLaunchOptionToggles"');
    expect(launch).not.toContain('video_options');

    const video = groupSource('video');
    expect(video).toContain('videoconfig.txt');
    expect(video).toContain('v-model="enable_graphics_preset"');
    expect(video).toContain('v-model="graphics_preset_id"');
    expect(video).toContain('v-for="opt in quickPresetVideoConfigToggles"');
    expect(video).not.toContain('launch_options');
  });

  it('keeps profile optimizations separate from settings bindings', () => {
    const profile = groupSource('profile');
    expect(profile).toContain('profile.cfg');
    expect(profile).toContain('v-for="opt in quickPresetGameSettingToggles"');
    expect(profile).not.toContain('quickPresetBindingToggles');

    const settings = groupSource('settings');
    expect(settings).toContain('settings.cfg');
    expect(settings).toContain("t('apexQuickPreset.bindingOptimizationsLabel')");
    expect(settings).toContain('v-for="binding in quickPresetBindingToggles"');
    expect(settings).not.toContain('quickPresetGameSettingToggles');
  });

  it('retains shared segmented controls and registered action icons', () => {
    for (const toggle of nodes.filter(node => node.tag === 'v-btn-toggle')) {
      expect(attribute(toggle, 'class')).toContain('game-page-segmented-toggle');
      expect(attribute(toggle, 'color')).toBe('primary');
      expect(attribute(toggle, 'variant')).toBe('text');
      expect(attribute(toggle, 'density')).toBe('compact');
      expect(toggle.props.some(prop => prop.name === 'border')).toBe(true);
      expect(toggle.props.some(prop => prop.name === 'divided')).toBe(true);
    }

    const registry = readFileSync(new URL(
      '../../../../../../src/icons/mdi-icons.ts', import.meta.url,
    ), 'utf8');
    for (const icon of new Set(source.match(/mdi-[a-z-]+/g))) {
      expect(registry).toContain(`'${icon}':`);
    }
  });
});
