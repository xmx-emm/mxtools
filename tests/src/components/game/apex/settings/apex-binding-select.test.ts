import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {Ref} from 'vue';

vi.mock('vue', async () => ({...await vi.importActual('vue'), onMounted: vi.fn(), onBeforeUnmount: vi.fn(),
  useSSRContext: () => ({modules: new Set()})}));
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (key: string) => key})}));
vi.mock('@/utils/shortcut-recording.ts', () => ({beginShortcutRecording: vi.fn(), endShortcutRecording: vi.fn()}));
vi.mock('vuetify/components/VIcon', () => ({VIcon: {}}));
import Component from '@/components/game/apex/settings/ApexBindingSelect.vue';

describe('Apex left mouse binding capture', () => {
  beforeEach(() => vi.stubGlobal('window', {dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn()}));
  afterEach(() => vi.unstubAllGlobals());

  it('arms on the first click and commits MOUSE1 on the second click', () => {
    const emit = vi.fn();
    const state = (Component as unknown as {setup(props: object, context: object): {
      recording: Ref<boolean>; toggleRecording(): void;
    }}).setup({modelValue: 'F', actionLabel: 'Fire', slotNumber: 1, disabled: false}, {emit, expose: vi.fn()});
    state.toggleRecording();
    expect(state.recording.value).toBe(true);
    expect(emit).not.toHaveBeenCalled();
    state.toggleRecording();
    expect(emit).toHaveBeenCalledExactlyOnceWith('update:modelValue', 'MOUSE1');
    expect(state.recording.value).toBe(false);
  });
});
