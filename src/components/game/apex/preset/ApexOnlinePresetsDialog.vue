<script setup lang="ts">
import {computed, reactive, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';
import {
  onlineAuthGetAccount,
  onlinePresetCommentCreate,
  onlinePresetComments,
  onlinePresetPublish,
  onlinePresetReport,
  onlinePresetUse,
  onlinePresetsList,
} from '@/ipc/commands.ts';
import type {
  OnlineAccount,
  OnlinePresetComment,
  OnlinePresetListItem,
  OnlinePresetScope,
} from '@/types/online.ts';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import {buildApexConfigSnapshot, parseApexConfigSnapshot} from '@/utils/game/apex_config_snapshot.ts';
import {
  buildPublishPayload,
  cleanPublishText,
  launcherRefFromKey,
  loadApexSnapshotBaseline,
  ONLINE_PRESET_DESCRIPTION_MAX,
  ONLINE_PRESET_TITLE_MAX,
  type PublishRemoval,
} from '@/utils/game/apex_publish_payload.ts';
import {snapshotDetails, type SnapshotBlock} from '@/utils/game/apex_snapshot_details.ts';
import ApexSnapshotSection from './ApexSnapshotSection.vue';
import {openApexConfigSnapshotWindow} from '@/utils/windows.ts';

const props = defineProps<{modelValue: boolean}>();
const emit = defineEmits<{(event: 'update:modelValue', value: boolean): void}>();

type TauriRuntimeWindow = Window & {__TAURI_INTERNALS__?: unknown};
const isTauriRuntime = typeof window !== 'undefined'
  && Boolean((window as TauriRuntimeWindow).__TAURI_INTERNALS__);

const {t} = useI18n();
const toast = useToast();
const apex_store = useApexStore();

const PAGE_SIZE = 20;
const items = ref<OnlinePresetListItem[]>([]);
const loading = ref(false);
const has_more = ref(false);
let list_generation = 0;
let list_request_id = 0;
const keyword = ref('');
const sort = ref<'latest' | 'popular'>('latest');
const account = ref<OnlineAccount | null>(null);
const using_id = ref('');

const expanded_id = ref('');
const comments = ref<OnlinePresetComment[]>([]);
const comments_loading = ref(false);
let comments_request_id = 0;
const comment_body = ref('');
const reply_to_id = ref('');
const comment_sending = ref(false);
let comment_submit_id = 0;

function invalidate_comments() {
  comments_request_id += 1;
  comment_submit_id += 1;
  comment_sending.value = false;
  comments_loading.value = false;
}

const publish_open = ref(false);
const publish_title = ref('');
const publish_description = ref('');
const publishing = ref(false);
// 发布内容 = 当前配置相对游戏默认值的差异，并剔除设备/个人信息；预览与上传使用同一份草稿。
const publish_loading = ref(false);
const publish_error = ref('');
const publish_payload = ref<ApexConfigSnapshot | null>(null);
const publish_removed = ref<PublishRemoval[]>([]);
let publish_request_id = 0;
const publish_selection = reactive<Record<SnapshotBlock, boolean>>({
  launch: true, aiming: true, controller: true, gameSettings: true, bindings: true, video: true,
});
const PUBLISH_BLOCKS = [
  ['launch', 'blockLaunch'], ['aiming', 'blockAiming'], ['controller', 'blockController'],
  ['gameSettings', 'blockGameSettings'], ['bindings', 'blockBindings'], ['video', 'blockVideo'],
] as const;
const publish_blocks = computed(() => PUBLISH_BLOCKS.map(([id, label]) => {
  const rows = publish_payload.value ? snapshotDetails(publish_payload.value, id) : [];
  return {id, label: t('apex.configSnapshot.' + label), rows, available: rows.length > 0};
}));
function publish_selected(id: SnapshotBlock) {
  return publish_selection[id] && publish_blocks.value.some(block => block.id === id && block.available);
}
const publish_has_changes = computed(() => publish_blocks.value.some(block => block.available));
const can_publish_selection = computed(() => publish_blocks.value.some(block => publish_selected(block.id)));
const publish_removed_device = computed(() => publish_removed.value.filter(item => item.reason === 'device').length);
const publish_removed_personal = computed(() => publish_removed.value.filter(item => item.reason === 'personal').length);
const publish_title_clean = computed(() => cleanPublishText(publish_title.value, ONLINE_PRESET_TITLE_MAX));

const report_open = ref(false);
const report_target = ref('');
const report_reason = ref('OTHER');
const report_detail = ref('');
const reporting = ref(false);

const reason_options = computed(() => [
  {value: 'SPAM', title: t('apex.onlinePresets.reasonSpam')},
  {value: 'HARASSMENT', title: t('apex.onlinePresets.reasonHarassment')},
  {value: 'OFFTOPIC', title: t('apex.onlinePresets.reasonOfftopic')},
  {value: 'OTHER', title: t('apex.onlinePresets.reasonOther')},
]);

function scope_label(scope: OnlinePresetScope): string {
  if (scope === 'launchOptions') return t('apex.onlinePresets.scopeLaunch');
  if (scope === 'videoConfig') return t('apex.onlinePresets.scopeVideo');
  return t('apex.onlinePresets.scopeGameSettings');
}

function scope_icon(scope: OnlinePresetScope): string {
  if (scope === 'launchOptions') return 'mdi-rocket-launch-outline';
  if (scope === 'videoConfig') return 'mdi-monitor';
  return 'mdi-tune-variant';
}

/** 列表为空时区分「搜索无结果」和「尚无预设」，避免误导用户去发布。 */
const searched_keyword = ref('');
const empty_text = computed(() => (searched_keyword.value
  ? t('apex.onlinePresets.emptySearch')
  : t('apex.onlinePresets.emptyList')));

function format_date(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function author_name(preset: OnlinePresetListItem): string {
  return preset.author?.displayName || t('apex.onlinePresets.anonymousAuthor');
}

function toast_error(error: unknown) {
  toast.error(String(error instanceof Error ? error.message : error ?? ''));
}

async function load_list(cursor?: string) {
  if (!isTauriRuntime) return;
  const generation = list_generation;
  const request_id = ++list_request_id;
  loading.value = true;
  try {
    const page = await onlinePresetsList({
      q: keyword.value.trim() || undefined,
      sort: sort.value,
      cursor,
      limit: PAGE_SIZE,
    });
    if (generation !== list_generation || request_id !== list_request_id) return;
    items.value = cursor ? [...items.value, ...page] : page;
    if (!cursor) searched_keyword.value = keyword.value.trim();
    has_more.value = page.length === PAGE_SIZE;
  } catch (error) {
    if (generation === list_generation && request_id === list_request_id) toast_error(error);
  } finally {
    if (request_id === list_request_id) loading.value = false;
  }
}

function reload() {
  list_generation += 1;
  invalidate_comments();
  expanded_id.value = '';
  void load_list();
}

function load_more() {
  if (loading.value || !has_more.value) return;
  const last = items.value[items.value.length - 1];
  if (last) void load_list(last.id);
}

async function refresh_account() {
  if (!isTauriRuntime) return;
  try {
    account.value = await onlineAuthGetAccount();
  } catch {
    account.value = null;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    list_generation += 1;
    invalidate_comments();
    if (!open) return;
    keyword.value = '';
    sort.value = 'latest';
    expanded_id.value = '';
    void load_list();
    void refresh_account();
  },
);

function close() {
  list_generation += 1;
  invalidate_comments();
  emit('update:modelValue', false);
}

/** 使用：匿名 +1 → 取回 payload → 进入现有导入预览（可撤销）。 */
async function use_preset(preset: OnlinePresetListItem) {
  if (using_id.value) return;
  using_id.value = preset.id;
  try {
    const result = await onlinePresetUse(preset.id);
    const snapshot = parseApexConfigSnapshot(JSON.stringify(result.payload));
    await openApexConfigSnapshotWindow('import', undefined, apex_store.launcher_selection_key, JSON.stringify(snapshot));
    close();
  } catch (error) {
    toast_error(error);
  } finally {
    using_id.value = '';
  }
}

async function toggle_comments(preset: OnlinePresetListItem) {
  invalidate_comments();
  if (expanded_id.value === preset.id) {
    expanded_id.value = '';
    return;
  }
  const request_id = comments_request_id;
  expanded_id.value = preset.id;
  comments.value = [];
  comment_body.value = '';
  reply_to_id.value = '';
  comments_loading.value = true;
  try {
    const next_comments = await onlinePresetComments(preset.id);
    if (request_id !== comments_request_id || expanded_id.value !== preset.id) return;
    comments.value = next_comments;
  } catch (error) {
    if (request_id === comments_request_id && expanded_id.value === preset.id) toast_error(error);
  } finally {
    if (request_id === comments_request_id) comments_loading.value = false;
  }
}

function start_reply(comment: OnlinePresetComment) {
  if (!account.value) return;
  reply_to_id.value = comment.id;
  comment_body.value = '';
}

function cancel_reply() {
  reply_to_id.value = '';
  comment_body.value = '';
}

async function submit_comment() {
  const body = comment_body.value.trim();
  if (!body || !expanded_id.value || comment_sending.value) return;
  const id = expanded_id.value;
  const generation = list_generation;
  const request_id = comments_request_id;
  const submit_id = ++comment_submit_id;
  const is_current = () => generation === list_generation
    && request_id === comments_request_id && submit_id === comment_submit_id
    && expanded_id.value === id;
  comment_sending.value = true;
  try {
    await onlinePresetCommentCreate({
      id,
      body,
      parentId: reply_to_id.value || undefined,
    });
    toast.success(t('apex.onlinePresets.commentSuccess'));
    if (!is_current()) return;
    comment_body.value = '';
    reply_to_id.value = '';
    const next_comments = await onlinePresetComments(id);
    if (is_current()) comments.value = next_comments;
  } catch (error) {
    if (is_current()) toast_error(error);
  } finally {
    if (submit_id === comment_submit_id) comment_sending.value = false;
  }
}

function open_publish() {
  publish_title.value = '';
  publish_description.value = '';
  Object.assign(publish_selection, {launch: true, aiming: true, controller: true, gameSettings: true, bindings: true, video: true});
  publish_open.value = true;
  void load_publish_preview();
}

async function load_publish_preview() {
  const request_id = ++publish_request_id;
  publish_loading.value = true;
  publish_error.value = '';
  publish_payload.value = null;
  publish_removed.value = [];
  try {
    const launcher = launcherRefFromKey(apex_store.launcher_selection_key);
    if (!launcher) throw new Error(t('apex.noLauncherAccount'));
    const [current, baseline] = await Promise.all([
      apex_store.build_config_snapshot({
        launchOptions: true, videoConfig: true, gameSettings: true, aiming: true, controller: true, bindings: true,
      }),
      loadApexSnapshotBaseline(launcher),
    ]);
    if (request_id !== publish_request_id) return;
    const result = buildPublishPayload(current, baseline);
    publish_payload.value = result.snapshot;
    publish_removed.value = result.removed;
  } catch (error) {
    if (request_id !== publish_request_id) return;
    const message = error instanceof Error ? error.message : String(error);
    publish_error.value = message.startsWith('apex.') ? t(message) : message;
  } finally {
    if (request_id === publish_request_id) publish_loading.value = false;
  }
}

async function submit_publish() {
  const draft = publish_payload.value;
  const title = publish_title_clean.value;
  if (!draft || !title || !can_publish_selection.value || publishing.value) return;
  publishing.value = true;
  try {
    // 只上传预览中显示并勾选的差异项，不从 store 重新读取。
    const snapshot = buildApexConfigSnapshot({
      selection: {
        launchOptions: publish_selected('launch'), videoConfig: publish_selected('video'),
        gameSettings: publish_selected('gameSettings'), aiming: publish_selected('aiming'),
        controller: publish_selected('controller'), bindings: publish_selected('bindings'),
      },
      launchOptionsRaw: draft.launchOptions?.raw,
      videoConfig: draft.videoConfig,
      gameSettings: draft.gameSettings,
    });
    await onlinePresetPublish({
      title,
      description: cleanPublishText(publish_description.value, ONLINE_PRESET_DESCRIPTION_MAX) || undefined,
      payload: snapshot,
    });
    toast.success(t('apex.onlinePresets.publishSuccess'));
    publish_open.value = false;
    reload();
  } catch (error) {
    toast_error(error);
  } finally {
    publishing.value = false;
  }
}

function open_report(preset: OnlinePresetListItem) {
  report_target.value = preset.id;
  report_reason.value = 'OTHER';
  report_detail.value = '';
  report_open.value = true;
}

async function submit_report() {
  if (!report_target.value || reporting.value) return;
  reporting.value = true;
  try {
    await onlinePresetReport({
      id: report_target.value,
      reason: report_reason.value,
      detail: report_detail.value.trim() || undefined,
    });
    toast.success(t('apex.onlinePresets.reportSuccess'));
    report_open.value = false;
  } catch (error) {
    toast_error(error);
  } finally {
    reporting.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="780"
    scrollable
    @update:model-value="(value: boolean) => { if (!value) close(); }"
  >
    <v-card class="online-presets-card">
      <header class="online-presets-header">
        <span class="online-presets-header-icon" aria-hidden="true">
          <v-icon icon="mdi-cloud-outline" size="18"/>
        </span>
        <div class="online-presets-header-text">
          <h2 class="online-presets-title">{{ t('apex.onlinePresets.dialogTitle') }}</h2>
          <p class="online-presets-hint">{{ t('apex.onlinePresets.dialogHint') }}</p>
        </div>
        <v-btn
          icon="mdi-close"
          size="small"
          variant="text"
          density="comfortable"
          :title="t('common.close')"
          :aria-label="t('common.close')"
          @click="close"
        />
      </header>

      <div class="online-presets-toolbar">
        <v-text-field
          v-model="keyword"
          class="online-presets-search"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          :placeholder="t('apex.onlinePresets.searchPlaceholder')"
          :aria-label="t('apex.onlinePresets.searchLabel')"
          @keyup.enter="reload"
          @click:clear="reload"
        />
        <v-btn-toggle
          v-model="sort"
          class="game-page-segmented-toggle"
          mandatory
          divided
          density="compact"
          color="primary"
          variant="text"
          border
          :aria-label="t('apex.onlinePresets.sortLabel')"
          @update:model-value="reload"
        >
          <v-btn size="small" value="latest">{{ t('apex.onlinePresets.sortLatest') }}</v-btn>
          <v-btn size="small" value="popular">{{ t('apex.onlinePresets.sortPopular') }}</v-btn>
        </v-btn-toggle>
        <v-btn
          icon="mdi-refresh"
          size="small"
          variant="text"
          density="compact"
          class="online-presets-icon-btn"
          :title="t('common.refresh')"
          :aria-label="t('common.refresh')"
          :loading="loading && items.length > 0"
          @click="reload"
        />
        <div class="online-presets-toolbar-end">
          <v-btn
            v-if="account"
            color="primary"
            variant="flat"
            size="small"
            prepend-icon="mdi-plus"
            class="online-presets-publish-btn"
            @click="open_publish"
          >
            {{ t('apex.onlinePresets.publishAction') }}
          </v-btn>
          <span v-else class="online-presets-login-hint">
            <v-icon icon="mdi-account-outline" size="14"/>
            {{ t('apex.onlinePresets.publishNeedLogin') }}
          </span>
        </div>
      </div>

      <div class="online-presets-scroll">
        <div v-if="loading && !items.length" class="online-presets-skeletons" aria-busy="true">
          <div v-for="index in 3" :key="index" class="online-preset-skeleton">
            <span class="online-preset-skeleton-line is-title"/>
            <span class="online-preset-skeleton-line is-chips"/>
            <span class="online-preset-skeleton-line is-meta"/>
          </div>
        </div>
        <div v-else-if="!items.length" class="online-presets-empty">
          <span class="online-presets-empty-icon" aria-hidden="true">
            <v-icon icon="mdi-cloud-outline" size="26"/>
          </span>
          <p>{{ empty_text }}</p>
        </div>

        <ul v-else class="online-presets-list">
          <li
            v-for="preset in items"
            :key="preset.id"
            class="online-preset-card"
            :class="{'is-expanded': expanded_id === preset.id}"
          >
            <div class="online-preset-top">
              <div class="online-preset-main">
                <h3 class="online-preset-title" :title="preset.title">{{ preset.title }}</h3>
                <div class="online-preset-scopes">
                  <span
                    v-for="scope in preset.scopes"
                    :key="scope"
                    class="online-preset-scope"
                  >
                    <v-icon :icon="scope_icon(scope)" size="12"/>
                    {{ scope_label(scope) }}
                  </span>
                </div>
                <p v-if="preset.description" class="online-preset-desc">{{ preset.description }}</p>
              </div>
              <v-btn
                color="primary"
                variant="tonal"
                size="small"
                prepend-icon="mdi-application-import"
                class="online-preset-use"
                :loading="using_id === preset.id"
                :disabled="Boolean(using_id) && using_id !== preset.id"
                :title="t('apex.onlinePresets.useTip')"
                @click="use_preset(preset)"
              >
                {{ t('apex.onlinePresets.useAction') }}
              </v-btn>
            </div>

            <div class="online-preset-footer">
              <span class="online-preset-stat">
                <v-icon icon="mdi-account-outline" size="13"/>
                {{ author_name(preset) }}
              </span>
              <span class="online-preset-stat">
                <v-icon icon="mdi-calendar-blank-outline" size="13"/>
                {{ format_date(preset.createdAt) }}
              </span>
              <span class="online-preset-stat">
                <v-icon icon="mdi-download" size="13"/>
                {{ t('apex.onlinePresets.usageCount', {count: preset.usageCount}) }}
              </span>
              <span class="online-preset-footer-actions">
                <button
                  type="button"
                  class="online-preset-link"
                  :class="{'is-active': expanded_id === preset.id}"
                  :aria-expanded="expanded_id === preset.id"
                  :title="t('apex.onlinePresets.toggleComments')"
                  @click="toggle_comments(preset)"
                >
                  <v-icon icon="mdi-comment-outline" size="13"/>
                  {{ t('apex.onlinePresets.commentCount', {count: preset.commentCount}) }}
                  <v-icon
                    :icon="expanded_id === preset.id ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                    size="13"
                  />
                </button>
                <button
                  v-if="account"
                  type="button"
                  class="online-preset-link is-report"
                  @click="open_report(preset)"
                >
                  <v-icon icon="mdi-flag-outline" size="13"/>
                  {{ t('apex.onlinePresets.reportAction') }}
                </button>
              </span>
            </div>

            <v-expand-transition>
              <div v-if="expanded_id === preset.id" class="online-preset-comments">
                <div v-if="comments_loading" class="online-presets-loading">
                  <v-progress-circular indeterminate size="18" width="2" color="primary"/>
                </div>
                <template v-else>
                  <p v-if="!comments.length" class="online-preset-muted">
                    {{ t('apex.onlinePresets.commentEmpty') }}
                  </p>
                  <div
                    v-for="comment in comments"
                    :key="comment.id"
                    class="online-preset-comment"
                    :class="{'is-reply-target': reply_to_id === comment.id}"
                  >
                    <div class="online-preset-comment-head">
                      <span class="online-preset-comment-author">
                        {{ comment.author?.displayName || t('apex.onlinePresets.anonymousAuthor') }}
                      </span>
                      <button
                        v-if="account"
                        type="button"
                        class="online-preset-link"
                        @click="start_reply(comment)"
                      >
                        <v-icon icon="mdi-reply" size="12"/>
                        {{ t('apex.onlinePresets.replyAction') }}
                      </button>
                    </div>
                    <p class="online-preset-comment-body">{{ comment.body }}</p>
                    <div
                      v-for="child in comment.children ?? []"
                      :key="child.id"
                      class="online-preset-comment online-preset-comment--child"
                    >
                      <span class="online-preset-comment-author">
                        {{ child.author?.displayName || t('apex.onlinePresets.anonymousAuthor') }}
                      </span>
                      <p class="online-preset-comment-body">{{ child.body }}</p>
                    </div>
                  </div>
                </template>

                <div v-if="account" class="online-preset-comment-editor">
                  <span v-if="reply_to_id" class="online-preset-replying">
                    <v-icon icon="mdi-reply" size="12"/>
                    {{ t('apex.onlinePresets.replying') }}
                    <button type="button" class="online-preset-link" @click="cancel_reply">
                      {{ t('common.cancel') }}
                    </button>
                  </span>
                  <v-text-field
                    v-model="comment_body"
                    class="online-preset-comment-input"
                    density="compact"
                    variant="outlined"
                    hide-details
                    maxlength="1000"
                    :placeholder="t('apex.onlinePresets.commentPlaceholder')"
                    @keyup.enter="submit_comment"
                  />
                  <v-btn
                    color="primary"
                    variant="tonal"
                    size="small"
                    prepend-icon="mdi-send"
                    class="online-preset-comment-send"
                    :loading="comment_sending"
                    :disabled="!comment_body.trim()"
                    @click="submit_comment"
                  >
                    {{ t('apex.onlinePresets.commentSubmit') }}
                  </v-btn>
                </div>
                <p v-else class="online-preset-muted">
                  {{ t('apex.onlinePresets.commentNeedLogin') }}
                </p>
              </div>
            </v-expand-transition>
          </li>
        </ul>

        <div v-if="has_more && items.length" class="online-presets-more">
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-chevron-down"
            :loading="loading"
            @click="load_more"
          >
            {{ t('apex.onlinePresets.loadMore') }}
          </v-btn>
        </div>
      </div>
    </v-card>

    <v-dialog v-model="publish_open" max-width="640" scrollable>
      <v-card class="online-presets-subcard">
        <header class="online-presets-header">
          <span class="online-presets-header-icon" aria-hidden="true">
            <v-icon icon="mdi-cloud-outline" size="18"/>
          </span>
          <div class="online-presets-header-text">
            <h2 class="online-presets-title">{{ t('apex.onlinePresets.publishTitle') }}</h2>
          </div>
        </header>
        <v-card-text class="online-presets-form">
          <v-text-field
            v-model="publish_title"
            density="compact"
            variant="outlined"
            :label="t('apex.onlinePresets.publishTitleLabel')"
            :maxlength="ONLINE_PRESET_TITLE_MAX"
            counter
          />
          <v-textarea
            v-model="publish_description"
            density="compact"
            variant="outlined"
            rows="2"
            auto-grow
            counter
            :label="t('apex.onlinePresets.publishDescriptionLabel')"
            :maxlength="ONLINE_PRESET_DESCRIPTION_MAX"
          />
          <p class="online-presets-hint">{{ t('apex.onlinePresets.publishPreviewHint') }}</p>
          <div v-if="publish_loading" class="online-presets-publish-state" aria-busy="true">
            <v-progress-circular indeterminate size="18" width="2" color="primary"/>
            <span>{{ t('apex.onlinePresets.publishPreviewLoading') }}</span>
          </div>
          <v-alert v-else-if="publish_error" type="error" variant="tonal" density="compact">
            <div>{{ t('apex.onlinePresets.publishPreviewFailed') }}</div>
            <div class="online-presets-publish-error">{{ publish_error }}</div>
            <template #append>
              <v-btn size="small" variant="text" prepend-icon="mdi-refresh" @click="load_publish_preview">
                {{ t('common.refresh') }}
              </v-btn>
            </template>
          </v-alert>
          <v-alert v-else-if="!publish_has_changes" type="info" variant="tonal" density="compact">
            {{ t('apex.onlinePresets.publishNothingChanged') }}
          </v-alert>
          <template v-else>
            <div class="online-presets-publish-preview">
              <ApexSnapshotSection
                v-for="block in publish_blocks"
                :key="block.id"
                v-model="publish_selection[block.id]"
                :title="block.label"
                :rows="block.rows"
                :disabled="publishing || !block.available"
              />
            </div>
            <p v-if="publish_removed_device" class="online-presets-hint">
              <v-icon icon="mdi-shield-check-outline" size="14"/>
              {{ t('apex.onlinePresets.publishRemovedDevice', {count: publish_removed_device}) }}
            </p>
            <p v-if="publish_removed_personal" class="online-presets-hint">
              <v-icon icon="mdi-shield-check-outline" size="14"/>
              {{ t('apex.onlinePresets.publishRemovedPersonal', {count: publish_removed_personal}) }}
            </p>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="text" @click="publish_open = false">{{ t('common.cancel') }}</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="publishing"
            :disabled="!publish_title_clean || !can_publish_selection || publish_loading"
            @click="submit_publish"
          >
            {{ t('apex.onlinePresets.publishSubmit') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="report_open" max-width="420">
      <v-card class="online-presets-subcard">
        <header class="online-presets-header">
          <span class="online-presets-header-icon is-report" aria-hidden="true">
            <v-icon icon="mdi-flag-outline" size="18"/>
          </span>
          <div class="online-presets-header-text">
            <h2 class="online-presets-title">{{ t('apex.onlinePresets.reportTitle') }}</h2>
          </div>
        </header>
        <v-card-text class="online-presets-form">
          <v-select
            v-model="report_reason"
            density="compact"
            variant="outlined"
            :items="reason_options"
            item-title="title"
            item-value="value"
            :label="t('apex.onlinePresets.reportReasonLabel')"
          />
          <v-textarea
            v-model="report_detail"
            density="compact"
            variant="outlined"
            rows="2"
            auto-grow
            counter
            :label="t('apex.onlinePresets.reportDetailLabel')"
            maxlength="500"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="text" @click="report_open = false">{{ t('common.cancel') }}</v-btn>
          <v-btn
            color="error"
            variant="tonal"
            :loading="reporting"
            @click="submit_report"
          >
            {{ t('apex.onlinePresets.reportSubmit') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-dialog>
</template>

<style scoped>
.online-presets-card {
  display: flex;
  flex-direction: column;
  max-height: min(78vh, 720px);
  overflow: hidden;
}

/* ---- header ---- */
.online-presets-header {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: var(--app-space-4) var(--app-space-4) var(--app-space-3) var(--app-space-5);
}
.online-presets-header-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--app-radius-md);
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}
.online-presets-header-icon.is-report {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.1);
}
.online-presets-header-text {
  flex: 1 1 auto;
  min-width: 0;
  padding-top: 1px;
}
.online-presets-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
}
.online-presets-hint {
  margin: 2px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 12px;
  line-height: 1.6;
}

/* ---- toolbar ---- */
.online-presets-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-space-2);
  padding: 0 var(--app-space-5) var(--app-space-3);
  border-bottom: 1px solid var(--app-border);
}
.online-presets-search {
  flex: 1 1 200px;
  max-width: 280px;
}
.online-presets-search :deep(.v-field) {
  --v-input-control-height: var(--app-control-height-action);
  border-radius: var(--app-radius-sm);
  font-size: 13px;
}
.online-presets-search :deep(.v-field__input) {
  min-height: var(--app-control-height-action);
  padding-top: 0;
  padding-bottom: 0;
}
.online-presets-icon-btn {
  width: var(--app-control-height-compact);
  height: var(--app-control-height-compact);
}
.online-presets-toolbar-end {
  display: flex;
  align-items: center;
  margin-left: auto;
}
.online-presets-publish-btn {
  height: var(--app-control-height-compact);
}
.online-presets-login-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 12px;
}

/* ---- scroll region ---- */
.online-presets-scroll {
  flex: 1 1 auto;
  min-height: 180px;
  overflow-y: auto;
  padding: var(--app-space-3) var(--app-space-5) var(--app-space-4);
}
.online-presets-loading {
  display: flex;
  justify-content: center;
  padding: var(--app-space-4) 0;
}
.online-presets-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-2);
  padding: 44px 0 36px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 13px;
  text-align: center;
}
.online-presets-empty p { margin: 0; }
.online-presets-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  color: rgba(var(--v-theme-on-surface), 0.42);
  background: var(--app-layer-muted);
}

/* ---- skeleton ---- */
.online-presets-skeletons,
.online-presets-list {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.online-preset-skeleton {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 14px var(--app-space-4);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
}
.online-preset-skeleton-line {
  height: 10px;
  border-radius: var(--app-radius-sm);
  background: var(--app-layer-muted);
  animation: online-preset-pulse 1.4s ease-in-out infinite;
}
.online-preset-skeleton-line.is-title { width: 42%; height: 13px; }
.online-preset-skeleton-line.is-chips { width: 26%; }
.online-preset-skeleton-line.is-meta { width: 58%; }
@keyframes online-preset-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@media (prefers-reduced-motion: reduce) {
  .online-preset-skeleton-line { animation: none; }
}

/* ---- preset card ---- */
.online-preset-card {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-layer);
  transition:
    border-color var(--app-transition),
    background-color var(--app-transition),
    box-shadow var(--app-transition);
}
.online-preset-card:hover {
  border-color: var(--app-border-strong);
  background: var(--app-layer-raised);
}
.online-preset-card.is-expanded {
  border-color: rgba(var(--v-theme-primary), 0.36);
  box-shadow: var(--app-shadow-sm);
}
.online-preset-top {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: 12px var(--app-space-4) 0;
}
.online-preset-main {
  flex: 1 1 auto;
  min-width: 0;
}
.online-preset-title {
  overflow: hidden;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.online-preset-scopes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.online-preset-scope {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 7px;
  border-radius: var(--app-radius-sm);
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.09);
  font-size: 11px;
  font-weight: 500;
}
.online-preset-desc {
  display: -webkit-box;
  margin: 7px 0 0;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.online-preset-use {
  flex: 0 0 auto;
  height: var(--app-control-height-compact);
}
.online-preset-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  padding: 9px var(--app-space-4) 10px;
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 12px;
}
.online-preset-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.online-preset-footer-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.online-preset-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--app-radius-sm);
  color: rgba(var(--v-theme-on-surface), 0.62);
  background: none;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: color var(--app-transition), background-color var(--app-transition);
}
.online-preset-link:hover {
  color: rgb(var(--v-theme-primary));
  background: var(--app-hover);
}
.online-preset-link:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.55);
  outline-offset: 1px;
}
.online-preset-link.is-active { color: rgb(var(--v-theme-primary)); }
.online-preset-link.is-report:hover { color: rgb(var(--v-theme-error)); }

/* ---- comments ---- */
.online-preset-comments {
  padding: var(--app-space-3) var(--app-space-4);
  border-top: 1px solid var(--app-border);
  border-radius: 0 0 var(--app-radius-md) var(--app-radius-md);
  background: var(--app-layer-muted);
}
.online-preset-muted {
  margin: 2px 0 4px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 12px;
}
.online-preset-comment {
  padding: 6px 0;
  font-size: 12px;
  line-height: 1.6;
}
.online-preset-comment + .online-preset-comment:not(.online-preset-comment--child) {
  border-top: 1px solid var(--app-border);
}
.online-preset-comment.is-reply-target > .online-preset-comment-head .online-preset-comment-author {
  color: rgb(var(--v-theme-primary));
}
.online-preset-comment--child {
  margin: 4px 0 0 4px;
  padding: 2px 0 2px 10px;
  border-left: 2px solid var(--app-border-strong);
}
.online-preset-comment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
}
.online-preset-comment-author {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-weight: 600;
}
.online-preset-comment-body {
  margin: 1px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.88);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.online-preset-comment-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-space-2);
  margin-top: var(--app-space-2);
}
.online-preset-comment-input {
  flex: 1 1 240px;
}
.online-preset-comment-input :deep(.v-field) {
  --v-input-control-height: var(--app-control-height-action);
  border-radius: var(--app-radius-sm);
  background: rgb(var(--v-theme-surface));
  font-size: 12px;
}
.online-preset-comment-input :deep(.v-field__input) {
  min-height: var(--app-control-height-action);
  padding-top: 0;
  padding-bottom: 0;
}
.online-preset-comment-send {
  height: var(--app-control-height-action);
}
.online-preset-replying {
  display: inline-flex;
  flex: 1 0 100%;
  align-items: center;
  gap: 4px;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 12px;
}
.online-presets-more {
  display: flex;
  justify-content: center;
  padding-top: var(--app-space-3);
}

/* ---- publish / report dialogs ---- */
.online-presets-subcard .online-presets-header {
  padding-bottom: var(--app-space-1);
}
.online-presets-form {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
}
.online-presets-publish-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 46vh;
  overflow-y: auto;
}
.online-presets-publish-state {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  min-height: var(--app-control-height-field);
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 12px;
}
.online-presets-publish-error {
  font-size: 12px;
  opacity: 0.8;
  word-break: break-word;
}
</style>
