import {afterEach, describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {compileScript, compileTemplate, parse} from '@vue/compiler-sfc';
import * as Vue from 'vue';
import {createRenderer, defineComponent, h, nextTick, type App as VueApp} from 'vue';
import {
  appConfirmationState, confirm, resolveAppConfirmation, runAppConfirmationAction,
} from '@/utils/app_confirmation.ts';

vi.mock('@/stores/style.ts', () => ({useUiStyleStore: () => ({watchSystemTheme: () => () => {}})}));
vi.mock('@/stores/settings.ts', () => ({useSettingsStore: () => ({performanceMode: false})}));
vi.mock('@/stores/state.ts', () => ({useStateStore: () => ({updateState: vi.fn()})}));
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (key: string) => key})}));
vi.mock('vue', async () => ({
  ...await vi.importActual<typeof import('vue')>('vue'),
  useSSRContext: () => ({modules: new Set()}),
}));
vi.mock('vuetify/components/VApp', () => ({VApp: {template: '<slot />'}}));
vi.mock('vuetify/components/VDialog', () => ({VDialog: {template: '<slot />'}}));
vi.mock('vuetify/components/VCard', () => ({
  VCard: {template: '<slot />'}, VCardTitle: {template: '<slot />'},
  VCardText: {template: '<slot />'}, VCardActions: {template: '<slot />'},
}));
vi.mock('vuetify/components/VBtn', () => ({VBtn: {template: '<slot />'}}));
vi.mock('vuetify/components/VIcon', () => ({VIcon: {template: '<slot />'}}));
vi.mock('vuetify/components/VGrid', () => ({VSpacer: {render: () => null}}));

import App from '@/App.vue';
import Dialog from '@/components/common/AppConfirmationDialog.vue';

// Vitest imports SFCs in SSR mode; compile their real templates for the host renderer.
function clientRender(file: string) {
  const {descriptor} = parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
  const script = compileScript(descriptor, {id: file});
  const {code, errors} = compileTemplate({
    source: descriptor.template!.content, filename: file, id: file,
    compilerOptions: {bindingMetadata: script.bindings},
  });
  if (errors.length) throw new Error(String(errors));
  const executable = code.replace(/import \{([^}]+)\} from "vue"/g,
    (_, imports: string) => `const {${imports.replace(/ as /g, ': ')}} = Vue`)
    .replace('export function render', 'return function render');
  return new Function('Vue', executable)(Vue);
}
App.render = clientRender('../../src/App.vue');
Dialog.render = clientRender('../../src/components/common/AppConfirmationDialog.vue');

interface HostNode { parent: HostNode | null; children: HostNode[] }
const node = (): HostNode => ({parent: null, children: []});
const renderer = createRenderer<HostNode, HostNode>({
  createElement: node, createText: node, createComment: node,
  setText() {}, setElementText() {}, patchProp() {},
  parentNode: n => n.parent,
  nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert(n, parent, anchor = null) {
    if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1);
    n.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, n);
  },
  remove(n) {
    if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1);
    n.parent = null;
  },
});

let app: VueApp | undefined;
let dialogMounts = 0;
let dialogUnmounts = 0;

function mountApp() {
  vi.stubGlobal('window', {__splashStart: 0});
  vi.stubGlobal('document', {
    documentElement: {toggleAttribute: vi.fn()}, getElementById: () => null,
  });
  dialogMounts = 0;
  dialogUnmounts = 0;
  app = renderer.createApp(App);
  app.component('router-view', defineComponent({render: () => h('route')}));
  app.mixin({
    mounted() {
      if (this.$options.__name === 'AppConfirmationDialog') dialogMounts++;
    },
    unmounted() {
      if (this.$options.__name === 'AppConfirmationDialog') dialogUnmounts++;
    },
  });
  app.mount(node());
}

afterEach(() => {
  app?.unmount();
  app = undefined;
  resolveAppConfirmation(false);
  vi.unstubAllGlobals();
});

describe('App confirmation lifecycle', () => {
  it('loads on first use and keeps the same dialog mounted across close and reopen', async () => {
    mountApp();
    await nextTick();
    expect(dialogMounts).toBe(0);
    const first = confirm('first', {title: 'First'});
    await vi.waitFor(() => expect(dialogMounts).toBe(1));
    resolveAppConfirmation(true);
    await expect(first).resolves.toBe(true);
    await nextTick();
    expect(dialogUnmounts).toBe(0);
    const second = confirm('second', {title: 'Second'});
    await nextTick();
    expect(dialogMounts).toBe(1);
    app!.unmount();
    app = undefined;
    await expect(second).resolves.toBe(false);
    expect(dialogUnmounts).toBe(1);
  });

  it('keeps a hidden action pending and cannot cancel the next confirmation when it finishes', async () => {
    mountApp();
    let release!: () => void;
    const actionDone = new Promise<void>(resolve => { release = resolve; });
    const onAction = vi.fn(() => actionDone);
    const pending = confirm('first', {title: 'First', actionText: 'Review', onAction});
    await vi.waitFor(() => expect(dialogMounts).toBe(1));
    const settled = vi.fn();
    void pending.then(settled);
    const running = runAppConfirmationAction();
    try {
      await nextTick();
      expect(appConfirmationState.open).toBe(false);
      expect(appConfirmationState.actionRunning).toBe(true);
      expect(dialogUnmounts).toBe(0);
      expect(settled).not.toHaveBeenCalled();
      expect(confirm('duplicate', {title: 'Duplicate'})).toBe(pending);
      await runAppConfirmationAction();
      expect(onAction).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await running;
    }
    await expect(pending).resolves.toBe(false);
    const next = confirm('next', {title: 'Next'});
    await nextTick();
    expect(appConfirmationState.open).toBe(true);
    expect(dialogMounts).toBe(1);
    resolveAppConfirmation(true);
    await expect(next).resolves.toBe(true);
  });
});
