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
import {parseApexConfigSnapshot} from '@/utils/game/apex_config_snapshot.ts';

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
const keyword = ref('');
const sort = ref<'latest' | 'popular'>('latest');
const account = ref<OnlineAccount | null>(null);
const using_id = ref('');

const expanded_id = ref('');
const comments = ref<OnlinePresetComment[]>([]);
const comments_loading = ref(false);
const comment_body = ref('');
const comment_sending = ref(false);

const publish_open = ref(false);
const publish_title = ref('');
const publish_description = ref('');
const publishing = ref(false);
const publish_selection = reactive({
  launchOptions: true,
  videoConfig: true,
  gameSettings: true,
  aiming: true,
  controller: true,
  bindings: true,
});
const can_publish_selection = computed(() => Object.values(publish_selection).some(Boolean));

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
  if (!isTauriRuntime || loading.value) return;
  loading.value = true;
  try {
    const page = await onlinePresetsList({
      q: keyword.value.trim() || undefined,
      sort: sort.value,
      cursor,
      limit: PAGE_SIZE,
    });
    items.value = cursor ? [...items.value, ...page] : page;
    has_more.value = page.length === PAGE_SIZE;
  } catch (error) {
    toast_error(error);
  } finally {
    loading.value = false;
  }
}

function reload() {
  expanded_id.value = '';
  void load_list();
}

function load_more() {
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
    if (!open) return;
    keyword.value = '';
    sort.value = 'latest';
    expanded_id.value = '';
    void load_list();
    void refresh_account();
  },
);

function close() {
  emit('update:modelValue', false);
}

/** 使用：匿名 +1 → 取回 payload → 进入现有导入预览（可撤销）。 */
async function use_preset(preset: OnlinePresetListItem) {
  if (using_id.value) return;
  using_id.value = preset.id;
  try {
    const result = await onlinePresetUse(preset.id);
    const snapshot = parseApexConfigSnapshot(JSON.stringify(result.payload));
    apex_store.set_config_import_snapshot(snapshot);
    apex_store.open_config_import_dialog();
    close();
  } catch (error) {
    toast_error(error);
  } finally {
    using_id.value = '';
  }
}

async function toggle_comments(preset: OnlinePresetListItem) {
  if (expanded_id.value === preset.id) {
    expanded_id.value = '';
    return;
  }
  expanded_id.value = preset.id;
  comments.value = [];
  comment_body.value = '';
  comments_loading.value = true;
  try {
    comments.value = await onlinePresetComments(preset.id);
  } catch (error) {
    toast_error(error);
  } finally {
    comments_loading.value = false;
  }
}

async function submit_comment() {
  const body = comment_body.value.trim();
  if (!body || !expanded_id.value || comment_sending.value) return;
  comment_sending.value = true;
  try {
    await onlinePresetCommentCreate({id: expanded_id.value, body});
    comment_body.value = '';
    comments.value = await onlinePresetComments(expanded_id.value);
    toast.success(t('apex.onlinePresets.commentSuccess'));
  } catch (error) {
    toast_error(error);
  } finally {
    comment_sending.value = false;
  }
}

function open_publish() {
  publish_title.value = '';
  publish_description.value = '';
  Object.assign(publish_selection, {
    launchOptions: true,
    videoConfig: true,
    gameSettings: true,
    aiming: true,
    controller: true,
    bindings: true,
  });
  publish_open.value = true;
}

async function submit_publish() {
  if (!publish_title.value.trim() || !can_publish_selection.value || publishing.value) return;
  publishing.value = true;
  try {
    const snapshot = await apex_store.build_config_snapshot({...publish_selection});
    await onlinePresetPublish({
      title: publish_title.value.trim(),
      description: publish_description.value.trim() || undefined,
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
    max-width="760"
    @update:model-value="(value: boolean) => { if (!value) close(); }"
  >
    <v-card :title="t('apex.onlinePresets.dialogTitle')">
      <v-card-text class="online-presets-body">
        <p class="online-presets-hint">{{ t('apex.onlinePresets.dialogHint') }}</p>

        <div class="online-presets-toolbar">
          <v-text-field
            v-model="keyword"
            class="online-presets-search"
            density="compact"
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
            :title="t('common.refresh')"
            :aria-label="t('common.refresh')"
            :loading="loading && items.length > 0"
            @click="reload"
          />
          <v-spacer/>
          <v-btn
            v-if="account"
            color="primary"
            variant="tonal"
            size="small"
            @click="open_publish"
          >
            {{ t('apex.onlinePresets.publishAction') }}
          </v-btn>
          <span v-else class="online-presets-login-hint">
            {{ t('apex.onlinePresets.publishNeedLogin') }}
          </span>
        </div>

        <div v-if="loading && !items.length" class="online-presets-loading">
          <v-progress-circular indeterminate size="22" width="2" color="primary"/>
        </div>
        <div v-else-if="!items.length" class="online-presets-empty">
          {{ t('apex.onlinePresets.emptyList') }}
        </div>

        <ul v-else class="online-presets-list">
          <li v-for="preset in items" :key="preset.id" class="online-preset-row">
            <div class="online-preset-main">
              <div class="online-preset-heading">
                <strong>{{ preset.title }}</strong>
                <span
                  v-for="scope in preset.scopes"
                  :key="scope"
                  class="online-preset-scope"
                >{{ scope_label(scope) }}</span>
              </div>
              <p v-if="preset.description" class="online-preset-desc">{{ preset.description }}</p>
              <div class="online-preset-meta">
                <span>{{ author_name(preset) }}</span>
                <span>{{ format_date(preset.createdAt) }}</span>
                <span>{{ t('apex.onlinePresets.usageCount', {count: preset.usageCount}) }}</span>
                <button
                  type="button"
                  class="online-preset-comments-toggle"
                  @click="toggle_comments(preset)"
                >
                  {{ t('apex.onlinePresets.commentCount', {count: preset.commentCount}) }}
                </button>
                <button
                  v-if="account"
                  type="button"
                  class="online-preset-report"
                  @click="open_report(preset)"
                >
                  {{ t('apex.onlinePresets.reportAction') }}
                </button>
              </div>
            </div>
            <div class="online-preset-actions">
              <v-btn
                color="primary"
                variant="tonal"
                size="small"
                :loading="using_id === preset.id"
                :title="t('apex.onlinePresets.useTip')"
                @click="use_preset(preset)"
              >
                {{ t('apex.onlinePresets.useAction') }}
              </v-btn>
            </div>

            <div v-if="expanded_id === preset.id" class="online-preset-comments">
              <div v-if="comments_loading" class="online-presets-loading">
                <v-progress-circular indeterminate size="18" width="2" color="primary"/>
              </div>
              <template v-else>
                <p v-if="!comments.length" class="online-preset-comments-empty">
                  {{ t('apex.onlinePresets.commentEmpty') }}
                </p>
                <div
                  v-for="comment in comments"
                  :key="comment.id"
                  class="online-preset-comment"
                >
                  <span class="online-preset-comment-author">
                    {{ comment.author?.displayName || t('apex.onlinePresets.anonymousAuthor') }}
                  </span>
                  <span class="online-preset-comment-body">{{ comment.body }}</span>
                  <div
                    v-for="child in comment.children ?? []"
                    :key="child.id"
                    class="online-preset-comment online-preset-comment--child"
                  >
                    <span class="online-preset-comment-author">
                      {{ child.author?.displayName || t('apex.onlinePresets.anonymousAuthor') }}
                    </span>
                    <span class="online-preset-comment-body">{{ child.body }}</span>
                  </div>
                </div>
              </template>
              <div v-if="account" class="online-preset-comment-editor">
                <v-text-field
                  v-model="comment_body"
                  density="compact"
                  hide-details
                  :placeholder="t('apex.onlinePresets.commentPlaceholder')"
                  @keyup.enter="submit_comment"
                />
                <v-btn
                  color="primary"
                  variant="tonal"
                  size="small"
                  :loading="comment_sending"
                  :disabled="!comment_body.trim()"
                  @click="submit_comment"
                >
                  {{ t('apex.onlinePresets.commentSubmit') }}
                </v-btn>
              </div>
              <p v-else class="online-preset-comments-empty">
                {{ t('apex.onlinePresets.commentNeedLogin') }}
              </p>
            </div>
          </li>
        </ul>

        <div v-if="has_more" class="online-presets-more">
          <v-btn variant="text" size="small" :loading="loading" @click="load_more">
            {{ t('apex.onlinePresets.loadMore') }}
          </v-btn>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn variant="text" @click="close">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>

    <v-dialog v-model="publish_open" max-width="440">
      <v-card :title="t('apex.onlinePresets.publishTitle')">
        <v-card-text>
          <v-text-field
            v-model="publish_title"
            density="compact"
            :label="t('apex.onlinePresets.publishTitleLabel')"
            maxlength="80"
            counter
          />
          <v-textarea
            v-model="publish_description"
            density="compact"
            rows="2"
            auto-grow
            :label="t('apex.onlinePresets.publishDescriptionLabel')"
            maxlength="400"
          />
          <p class="online-presets-hint">{{ t('apex.onlinePresets.publishScopeHint') }}</p>
          <v-checkbox
            v-model="publish_selection.launchOptions"
            density="compact"
            hide-details
            :label="t('apex.configSnapshot.blockLaunch')"
          />
          <v-checkbox
            v-model="publish_selection.aiming"
            density="compact"
            hide-details
            :label="t('apex.configSnapshot.blockAiming')"
          />
          <v-checkbox
            v-model="publish_selection.controller"
            density="compact"
            hide-details
            :label="t('apex.configSnapshot.blockController')"
          />
          <v-checkbox
            v-model="publish_selection.bindings"
            density="compact"
            hide-details
            :label="t('apex.configSnapshot.blockBindings')"
          />
          <v-checkbox
            v-model="publish_selection.gameSettings"
            density="compact"
            hide-details
            :label="t('apex.configSnapshot.blockGameSettings')"
          />
          <v-checkbox
            v-model="publish_selection.videoConfig"
            density="compact"
            hide-details
            :label="t('apex.configSnapshot.blockVideo')"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="text" @click="publish_open = false">{{ t('common.cancel') }}</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            :loading="publishing"
            :disabled="!publish_title.trim() || !can_publish_selection"
            @click="submit_publish"
          >
            {{ t('apex.onlinePresets.publishSubmit') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="report_open" max-width="420">
      <v-card :title="t('apex.onlinePresets.reportTitle')">
        <v-card-text>
          <v-select
            v-model="report_reason"
            density="compact"
            :items="reason_options"
            item-title="title"
            item-value="value"
            :label="t('apex.onlinePresets.reportReasonLabel')"
          />
          <v-textarea
            v-model="report_detail"
            density="compact"
            rows="2"
            auto-grow
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
.online-presets-body {
  display: flex;
  flex-direction: column;
  max-height: min(66vh, 620px);
  gap: 10px;
}
.online-presets-hint {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 11px;
  line-height: 1.6;
}
.online-presets-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.online-presets-search {
  flex: 1 1 220px;
  max-width: 300px;
}
.online-presets-login-hint {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 10px;
}
.online-presets-loading {
  display: flex;
  justify-content: center;
  padding: 26px 0;
}
.online-presets-empty {
  padding: 34px 0;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 12px;
  text-align: center;
}
.online-presets-list {
  flex: 1 1 auto;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border-top: 1px solid var(--app-border);
}
.online-preset-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 14px;
  padding: 11px 2px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}
.online-preset-main { min-width: 0; }
.online-preset-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}
.online-preset-heading strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 640;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.online-preset-scope {
  padding: 1px 6px;
  border: 1px solid rgba(var(--v-theme-primary), 0.3);
  border-radius: 4px;
  color: rgb(var(--v-theme-primary));
  font-size: 9px;
}
.online-preset-desc {
  display: -webkit-box;
  margin: 3px 0 0;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 11px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.online-preset-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 5px;
  color: rgba(var(--v-theme-on-surface), 0.46);
  font-size: 10px;
}
.online-preset-comments-toggle,
.online-preset-report {
  padding: 0;
  border: 0;
  color: rgb(var(--v-theme-primary));
  background: none;
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.online-preset-report { color: rgba(var(--v-theme-on-surface), 0.46); }
.online-preset-report:hover { color: rgb(var(--v-theme-error)); }
.online-preset-actions {
  display: flex;
  align-items: center;
}
.online-preset-comments {
  grid-column: 1 / -1;
  padding: 8px 0 2px;
  border-top: 1px dashed rgba(var(--v-border-color), 0.14);
}
.online-preset-comment {
  padding: 5px 0;
  font-size: 11px;
  line-height: 1.55;
}
.online-preset-comment--child {
  margin-left: 16px;
  padding: 3px 0 0;
}
.online-preset-comment-author {
  margin-right: 8px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-weight: 620;
}
.online-preset-comment-body {
  color: rgba(var(--v-theme-on-surface), 0.85);
  overflow-wrap: anywhere;
}
.online-preset-comments-empty {
  margin: 4px 0;
  color: rgba(var(--v-theme-on-surface), 0.45);
  font-size: 10px;
}
.online-preset-comment-editor {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.online-presets-more { text-align: center; }
</style>
