import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {effectScope, nextTick, reactive, type Ref} from 'vue';
import type {OnlinePresetComment, OnlinePresetListItem} from '@/types/online.ts';

const mocks = vi.hoisted(() => ({
  onlinePresetCommentCreate: vi.fn(), onlinePresetComments: vi.fn(),
  onlinePresetsList: vi.fn(), onlineAuthGetAccount: vi.fn(),
  success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/ipc/commands.ts', () => ({...mocks,
  onlinePresetPublish: vi.fn(), onlinePresetReport: vi.fn(), onlinePresetUse: vi.fn(),
}));
vi.mock('@/stores/game/apex.ts', () => ({useApexStore: () => ({})}));
vi.mock('@/utils/windows.ts', () => ({openApexConfigSnapshotWindow: vi.fn()}));
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (key: string) => key})}));
vi.mock('vue-toastification', () => ({useToast: () => mocks}));
vi.mock('vue', async () => ({...await vi.importActual<typeof import('vue')>('vue'),
  useSSRContext: () => ({modules: new Set()}),
}));
vi.mock('vuetify/components/VDialog', () => ({VDialog: {}}));
vi.mock('vuetify/components/VCard', () => ({VCard: {}, VCardText: {}, VCardActions: {}}));
vi.mock('vuetify/components/VTextField', () => ({VTextField: {}}));
vi.mock('vuetify/components/VTextarea', () => ({VTextarea: {}}));
vi.mock('vuetify/components/VBtnToggle', () => ({VBtnToggle: {}}));
vi.mock('vuetify/components/VBtn', () => ({VBtn: {}}));
vi.mock('vuetify/components/VGrid', () => ({VSpacer: {}}));
vi.mock('vuetify/components/VProgressCircular', () => ({VProgressCircular: {}}));
vi.mock('vuetify/components/VCheckbox', () => ({VCheckbox: {}}));
vi.mock('vuetify/components/VSelect', () => ({VSelect: {}}));
import Component from '@/components/game/apex/preset/ApexOnlinePresetsDialog.vue';

type State = {
  comment_body: Ref<string>; reply_to_id: Ref<string>; comment_sending: Ref<boolean>;
  comments: Ref<OnlinePresetComment[]>;
  toggle_comments(preset: OnlinePresetListItem): Promise<void>;
  submit_comment(): Promise<void>; close(): void; reload(): void;
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
const preset = (id: string) => ({id}) as OnlinePresetListItem;
const comments = (id: string) => [{id, body: id}] as OnlinePresetComment[];
const scopes: ReturnType<typeof effectScope>[] = [];
function setupDialog() {
  const props = reactive({modelValue: true});
  const scope = effectScope();
  scopes.push(scope);
  const setup = (Component as unknown as {
    setup(props: object, context: {expose: () => void; emit: () => void}): State;
  }).setup;
  const state = scope.run(() => setup(props, {expose: vi.fn(), emit: vi.fn()}))!;
  return {state, props};
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.onlinePresetComments.mockResolvedValue([]);
});
afterEach(() => {scopes.splice(0).forEach(scope => scope.stop());});

describe('online preset comment submission races', () => {
  it('submits the captured target and reply, clears its draft and refreshes on success', async () => {
    const {state} = setupDialog();
    await state.toggle_comments(preset('a'));
    const create = deferred<void>();
    mocks.onlinePresetCommentCreate.mockReturnValueOnce(create.promise);
    mocks.onlinePresetComments.mockResolvedValueOnce(comments('saved'));
    state.comment_body.value = '  hello  ';
    state.reply_to_id.value = 'parent';
    const pending = state.submit_comment();
    expect(state.comment_sending.value).toBe(true);
    expect(mocks.onlinePresetCommentCreate).toHaveBeenCalledWith({id: 'a', body: 'hello', parentId: 'parent'});
    create.resolve();
    await pending;
    expect(state.comment_body.value).toBe('');
    expect(state.reply_to_id.value).toBe('');
    expect(state.comments.value).toEqual(comments('saved'));
    expect(mocks.onlinePresetComments).toHaveBeenLastCalledWith('a');
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith('apex.onlinePresets.commentSuccess');
    expect(state.comment_sending.value).toBe(false);
  });

  it.each(['switch', 'reopen-same', 'close', 'prop-close', 'reload'])(
    'does not clear or refresh the new editor after create resolves: %s', async action => {
      const {state, props} = setupDialog();
      await state.toggle_comments(preset('a'));
      const create = deferred<void>();
      mocks.onlinePresetCommentCreate.mockReturnValueOnce(create.promise);
      state.comment_body.value = 'old';
      const pending = state.submit_comment();
      if (action === 'switch') await state.toggle_comments(preset('b'));
      if (action === 'reopen-same') {
        await state.toggle_comments(preset('a'));
        await state.toggle_comments(preset('a'));
      }
      if (action === 'close') state.close();
      if (action === 'prop-close') {props.modelValue = false; await nextTick();}
      if (action === 'reload') state.reload();
      state.comment_body.value = 'new draft';
      state.reply_to_id.value = 'new parent';
      state.comments.value = comments('new');
      mocks.onlinePresetComments.mockClear();
      create.resolve();
      await pending;
      expect(state.comment_body.value).toBe('new draft');
      expect(state.reply_to_id.value).toBe('new parent');
      expect(state.comments.value).toEqual(comments('new'));
      expect(mocks.onlinePresetComments).not.toHaveBeenCalled();
      expect(mocks.success).toHaveBeenCalledExactlyOnceWith('apex.onlinePresets.commentSuccess');
    },
  );

  it.each(['resolve', 'reject'] as const)('ignores a stale refresh %s while a newer submission is pending', async outcome => {
    const {state} = setupDialog();
    await state.toggle_comments(preset('a'));
    const refresh = deferred<OnlinePresetComment[]>();
    mocks.onlinePresetComments.mockReturnValueOnce(refresh.promise);
    state.comment_body.value = 'old';
    const pending = state.submit_comment();
    await vi.waitFor(() => expect(mocks.onlinePresetComments).toHaveBeenCalledTimes(2));
    await state.toggle_comments(preset('b'));
    const create = deferred<void>();
    mocks.onlinePresetCommentCreate.mockReturnValueOnce(create.promise);
    state.comment_body.value = 'new draft';
    state.reply_to_id.value = 'new parent';
    state.comments.value = comments('new');
    const newer = state.submit_comment();
    if (outcome === 'resolve') refresh.resolve(comments('stale'));
    else refresh.reject(new Error('stale refresh'));
    await pending;
    expect(state.comment_sending.value).toBe(true);
    expect(state.comment_body.value).toBe('new draft');
    expect(state.reply_to_id.value).toBe('new parent');
    expect(state.comments.value).toEqual(comments('new'));
    expect(mocks.error).not.toHaveBeenCalled();
    create.resolve();
    await newer;
    expect(state.comment_sending.value).toBe(false);
  });

  it('keeps the draft on create failure and reports an active refresh failure after success', async () => {
    const {state} = setupDialog();
    await state.toggle_comments(preset('a'));
    state.comment_body.value = 'retry';
    mocks.onlinePresetCommentCreate.mockRejectedValueOnce(new Error('create failed'));
    await state.submit_comment();
    expect(state.comment_body.value).toBe('retry');
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenLastCalledWith('create failed');
    mocks.onlinePresetComments.mockRejectedValueOnce(new Error('refresh failed'));
    await state.submit_comment();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith('apex.onlinePresets.commentSuccess');
    expect(mocks.error).toHaveBeenLastCalledWith('refresh failed');
    expect(state.comment_sending.value).toBe(false);
  });
});
