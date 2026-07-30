<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {open} from '@tauri-apps/plugin-dialog';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {applyLocalShare, listShareAccounts, previewLocalShare} from '@/ipc/commands.ts';
import {folderSharingErrorKey, normalizeFolderSharingError} from '@/utils/folder_sharing.ts';
import type {
  NtfsAclPreview,
  ShareAccount,
  ShareApplyResult,
  ShareDetails,
  ShareMutationRequest,
  SharePermission,
} from '@/types/folder_sharing.ts';

const props = defineProps<{
  modelValue: boolean;
  details: ShareDetails | null;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [result: ShareApplyResult];
}>();

const {t} = useI18n();
const toast = useToast();
const step = ref(1);
const name = ref('');
const path = ref('');
const description = ref('');
const accounts = ref<ShareAccount[]>([]);
const selectedSids = ref<string[]>([]);
const permissions = ref<Record<string, SharePermission>>({});
const preview = ref<NtfsAclPreview | null>(null);
const loadingAccounts = ref(false);
const previewing = ref(false);
const applying = ref(false);
const errorText = ref('');

const isEditing = computed(() => Boolean(props.details));
const selectableAccounts = computed(() => accounts.value.filter(account => account.selectable));
const unavailableAccounts = computed(() => accounts.value.filter(account => !account.selectable));
const unsupportedAccessCount = computed(() => {
  if (!props.details) return 0;
  const known = new Set(accounts.value.map(account => account.sid));
  return props.details.access.filter(entry => (
    entry.accessControlType.toLowerCase() === 'allow'
      && entry.sid !== 'S-1-5-32-544'
      && !known.has(entry.sid)
  )).length;
});
const selectedAccounts = computed(() => selectableAccounts.value.filter(
  account => selectedSids.value.includes(account.sid),
));
const stepOneValid = computed(() => Boolean(name.value.trim() && path.value.trim()));
const stepTwoValid = computed(() => selectedAccounts.value.length > 0);
const authenticatedUsersSelected = computed(() => selectedSids.value.includes('S-1-5-11'));

function formatError(error: unknown): string {
  const normalized = normalizeFolderSharingError(error);
  return t(folderSharingErrorKey(normalized), {message: normalized.message});
}

function resetForm() {
  step.value = 1;
  preview.value = null;
  errorText.value = '';
  name.value = props.details?.share.name ?? '';
  path.value = props.details?.share.path ?? '';
  description.value = props.details?.share.description ?? '';
  selectedSids.value = [];
  permissions.value = {};
}

function hydrateExistingAccess() {
  if (!props.details) return;
  const selectable = new Set(selectableAccounts.value.map(account => account.sid));
  for (const entry of props.details.access) {
    if (entry.accessControlType.toLowerCase() !== 'allow' || !selectable.has(entry.sid)) continue;
    selectedSids.value.push(entry.sid);
    permissions.value[entry.sid] = entry.accessRight.toLowerCase() === 'read' ? 'read' : 'change';
  }
}

async function loadAccounts() {
  loadingAccounts.value = true;
  try {
    accounts.value = await listShareAccounts();
    hydrateExistingAccess();
  } catch (error) {
    errorText.value = formatError(error);
  } finally {
    loadingAccounts.value = false;
  }
}

watch(() => props.modelValue, openValue => {
  if (!openValue) return;
  resetForm();
  void loadAccounts();
});

async function chooseFolder() {
  const selected = await open({directory: true, multiple: false});
  if (typeof selected !== 'string') return;
  path.value = selected;
  if (!name.value.trim() && !isEditing.value) {
    name.value = selected.split(/[\\/]/).filter(Boolean).pop() ?? '';
  }
}

function toggleAccount(account: ShareAccount, selected: boolean | null) {
  if (!account.selectable) return;
  if (selected) {
    if (!selectedSids.value.includes(account.sid)) selectedSids.value.push(account.sid);
    permissions.value[account.sid] ??= 'read';
  } else {
    selectedSids.value = selectedSids.value.filter(sid => sid !== account.sid);
  }
  preview.value = null;
}

function setPermission(sid: string, value: SharePermission | null) {
  if (value) permissions.value[sid] = value;
  preview.value = null;
}

function requestPayload(): ShareMutationRequest {
  return {
    originalName: props.details?.share.name ?? null,
    name: name.value.trim(),
    path: path.value.trim(),
    description: description.value.trim(),
    principals: selectedAccounts.value.map(account => ({
      accountName: account.accountName,
      sid: account.sid,
      permission: permissions.value[account.sid] ?? 'read',
    })),
  };
}

async function goNext() {
  errorText.value = '';
  if (step.value === 1 && stepOneValid.value) {
    step.value = 2;
    return;
  }
  if (step.value !== 2 || !stepTwoValid.value) return;
  previewing.value = true;
  try {
    preview.value = await previewLocalShare({request: requestPayload()});
    step.value = 3;
  } catch (error) {
    errorText.value = formatError(error);
  } finally {
    previewing.value = false;
  }
}

function goBack() {
  errorText.value = '';
  if (step.value > 1) step.value -= 1;
}

async function save() {
  if (!preview.value || applying.value) return;
  applying.value = true;
  errorText.value = '';
  try {
    const result = await applyLocalShare({request: requestPayload()});
    toast.success(t(isEditing.value ? 'folderSharing.local.updated' : 'folderSharing.local.created'));
    emit('saved', result);
    emit('update:modelValue', false);
  } catch (error) {
    errorText.value = formatError(error);
  } finally {
    applying.value = false;
  }
}

function close() {
  if (!applying.value) emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="780"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card class="share-editor">
      <v-card-title class="editor-title">
        <span>{{ t(isEditing ? 'folderSharing.editor.editTitle' : 'folderSharing.editor.createTitle') }}</span>
        <v-btn icon="mdi-close" size="small" variant="text" :disabled="applying" @click="close" />
      </v-card-title>

      <div class="steps" role="list">
        <div v-for="index in 3" :key="index" :class="['step', {active: step === index, done: step > index}]">
          <span>{{ index }}</span>
          <b>{{ t(`folderSharing.editor.steps.${index}`) }}</b>
        </div>
      </div>

      <v-card-text class="editor-body">
        <v-alert v-if="errorText" type="error" variant="tonal" density="compact" class="mb-4">
          {{ errorText }}
        </v-alert>

        <section v-if="step === 1" class="form-section">
          <div class="path-field">
            <v-text-field
              v-model="path"
              :label="t('folderSharing.editor.folder')"
              variant="outlined"
              density="compact"
              hide-details="auto"
              :readonly="isEditing"
            />
            <v-tooltip :text="t('folderSharing.editor.chooseFolder')">
              <template #activator="{props: activatorProps}">
                <v-btn
                  v-bind="activatorProps"
                  class="folder-picker-button"
                  icon="mdi-folder-open-outline"
                  size="small"
                  variant="tonal"
                  :disabled="isEditing"
                  :aria-label="t('folderSharing.editor.chooseFolder')"
                  @click="chooseFolder"
                />
              </template>
            </v-tooltip>
          </div>
          <v-text-field
            v-model="name"
            :label="t('folderSharing.editor.shareName')"
            variant="outlined"
            density="compact"
            hide-details="auto"
            maxlength="80"
            :readonly="isEditing"
          />
          <v-textarea
            v-model="description"
            :label="t('folderSharing.editor.description')"
            variant="outlined"
            density="compact"
            rows="2"
            hide-details="auto"
            maxlength="256"
          />
          <v-alert type="info" variant="tonal" density="compact">
            {{ t('folderSharing.editor.folderSafety') }}
          </v-alert>
        </section>

        <section v-else-if="step === 2" class="form-section">
          <v-skeleton-loader v-if="loadingAccounts" type="list-item-two-line@4" />
          <template v-else>
            <div class="fixed-admin">
              <v-icon icon="mdi-security" color="primary" />
              <div>
                <b>{{ t('folderSharing.editor.administrators') }}</b>
                <span>{{ t('folderSharing.permissions.full') }}</span>
              </div>
              <v-chip size="small" color="primary" variant="tonal">{{ t('folderSharing.editor.required') }}</v-chip>
            </div>

            <div v-for="account in selectableAccounts" :key="account.sid" class="account-row">
              <v-checkbox
                :model-value="selectedSids.includes(account.sid)"
                density="compact"
                hide-details
                :aria-label="account.displayName"
                @update:model-value="toggleAccount(account, $event)"
              />
              <div class="account-copy">
                <b>{{ account.wellKnown ? t('folderSharing.editor.authenticatedUsers') : account.displayName }}</b>
                <span>{{ account.accountName }}</span>
              </div>
              <v-chip v-if="!account.passwordRequired && !account.wellKnown" size="x-small" color="warning" variant="tonal">
                {{ t('folderSharing.editor.passwordNotRequired') }}
              </v-chip>
              <v-btn-toggle
                v-if="selectedSids.includes(account.sid)"
                :model-value="permissions[account.sid] ?? 'read'"
                mandatory
                density="compact"
                variant="outlined"
                @update:model-value="setPermission(account.sid, $event)"
              >
                <v-btn value="read" size="small">{{ t('folderSharing.permissions.read') }}</v-btn>
                <v-btn value="change" size="small">{{ t('folderSharing.permissions.change') }}</v-btn>
              </v-btn-toggle>
            </div>

            <v-alert v-if="authenticatedUsersSelected" type="warning" variant="tonal" density="compact">
              {{ t('folderSharing.editor.authenticatedUsersWarning') }}
            </v-alert>
            <v-alert v-if="unsupportedAccessCount" type="warning" variant="tonal" density="compact">
              {{ t('folderSharing.editor.unsupportedAccess', {count: unsupportedAccessCount}) }}
            </v-alert>

            <details v-if="unavailableAccounts.length" class="unavailable-accounts">
              <summary>{{ t('folderSharing.editor.unavailableAccounts', {count: unavailableAccounts.length}) }}</summary>
              <div v-for="account in unavailableAccounts" :key="account.sid">
                <span>{{ account.displayName }}</span>
                <small>{{ t('folderSharing.editor.disabledAccount') }}</small>
              </div>
            </details>
          </template>
        </section>

        <section v-else class="preview-section">
          <div class="preview-block">
            <h3>{{ t('folderSharing.editor.shareAcl') }}</h3>
            <div class="preview-row">
              <span>{{ t('folderSharing.editor.administrators') }}</span>
              <v-chip size="small" color="primary" variant="tonal">{{ t('folderSharing.permissions.full') }}</v-chip>
            </div>
            <div v-for="account in selectedAccounts" :key="account.sid" class="preview-row">
              <span>{{ account.wellKnown ? t('folderSharing.editor.authenticatedUsers') : account.accountName }}</span>
              <v-chip size="small" variant="tonal">
                {{ t(`folderSharing.permissions.${permissions[account.sid] ?? 'read'}`) }}
              </v-chip>
            </div>
          </div>

          <div class="preview-block">
            <h3>{{ t('folderSharing.editor.ntfsAcl') }}</h3>
            <div v-for="change in preview?.changes" :key="change.sid" class="preview-row">
              <div>
                <span>{{ change.accountName }}</span>
                <small>{{ change.requiredRights }}</small>
              </div>
              <v-chip :color="change.willAdd ? 'warning' : 'success'" size="small" variant="tonal">
                {{ t(change.willAdd ? 'folderSharing.editor.willAdd' : 'folderSharing.editor.alreadyGranted') }}
              </v-chip>
            </div>
          </div>

          <details class="sddl-preview">
            <summary>{{ t('folderSharing.editor.sddlDetails') }}</summary>
            <label>{{ t('folderSharing.editor.before') }}</label>
            <code>{{ preview?.beforeSddl }}</code>
            <label>{{ t('folderSharing.editor.after') }}</label>
            <code>{{ preview?.afterSddl }}</code>
          </details>
        </section>
      </v-card-text>

      <v-card-actions class="editor-actions">
        <v-btn variant="text" :disabled="applying" @click="close">{{ t('common.cancel') }}</v-btn>
        <v-spacer />
        <v-btn v-if="step > 1" variant="text" :disabled="applying" @click="goBack">
          {{ t('folderSharing.editor.back') }}
        </v-btn>
        <v-btn
          v-if="step < 3"
          color="primary"
          variant="flat"
          :loading="previewing"
          :disabled="step === 1 ? !stepOneValid : !stepTwoValid || loadingAccounts"
          @click="goNext"
        >
          {{ step === 2 ? t('folderSharing.editor.preview') : t('folderSharing.editor.next') }}
        </v-btn>
        <v-btn v-else color="primary" variant="flat" :loading="applying" @click="save">
          {{ t(isEditing ? 'folderSharing.editor.applyChanges' : 'folderSharing.editor.create') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.share-editor { border-radius: 8px; }
.editor-title { display: flex; align-items: center; justify-content: space-between; font-size: 1rem; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 0 20px 14px; border-bottom: 1px solid rgba(var(--v-border-color), 0.14); }
.step { display: flex; align-items: center; gap: 7px; min-width: 0; color: rgba(var(--v-theme-on-surface), 0.45); font-size: 0.72rem; }
.step span { display: grid; place-items: center; width: 23px; height: 23px; flex: 0 0 23px; border: 1px solid currentColor; border-radius: 50%; }
.step b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step.active, .step.done { color: rgb(var(--v-theme-primary)); }
.editor-body { min-height: 390px; max-height: min(64vh, 620px); overflow-y: auto; }
.form-section, .preview-section { display: flex; flex-direction: column; gap: 14px; }
.path-field { display: grid; grid-template-columns: minmax(0, 1fr) 40px; align-items: start; gap: 8px; }
.folder-picker-button {
  width: 40px !important;
  min-width: 40px !important;
  max-width: 40px !important;
  height: 40px !important;
  min-height: 40px !important;
  aspect-ratio: 1;
  align-self: start;
}
.folder-picker-button :deep(.v-icon) {
  width: 20px;
  height: 20px;
  font-size: 20px;
}
.fixed-admin, .account-row { display: flex; align-items: center; min-height: 54px; gap: 10px; padding: 7px 10px; border-bottom: 1px solid rgba(var(--v-border-color), 0.11); }
.fixed-admin { border: 1px solid rgba(var(--v-theme-primary), 0.18); border-radius: 6px; background: rgba(var(--v-theme-primary), 0.04); }
.fixed-admin > div, .account-copy { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; }
.fixed-admin b, .account-copy b { font-size: 0.8rem; }
.fixed-admin span, .account-copy span { overflow: hidden; color: rgba(var(--v-theme-on-surface), 0.55); font-size: 0.68rem; text-overflow: ellipsis; white-space: nowrap; }
.account-row :deep(.v-btn-toggle) { flex: 0 0 auto; height: 30px; }
.account-row :deep(.v-btn) { min-height: 30px; padding-inline: 10px; font-size: 0.7rem; }
.unavailable-accounts, .sddl-preview { padding: 10px; border: 1px solid rgba(var(--v-border-color), 0.12); border-radius: 6px; font-size: 0.72rem; }
.unavailable-accounts summary, .sddl-preview summary { cursor: pointer; font-weight: 600; }
.unavailable-accounts div { display: flex; justify-content: space-between; padding-top: 7px; color: rgba(var(--v-theme-on-surface), 0.6); }
.preview-block { border: 1px solid rgba(var(--v-border-color), 0.14); border-radius: 6px; overflow: hidden; }
.preview-block h3 { margin: 0; padding: 10px 12px; background: rgba(var(--v-theme-on-surface), 0.035); font-size: 0.78rem; }
.preview-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 43px; padding: 7px 12px; border-top: 1px solid rgba(var(--v-border-color), 0.1); font-size: 0.75rem; }
.preview-row > div { display: flex; flex-direction: column; min-width: 0; }
.preview-row small { color: rgba(var(--v-theme-on-surface), 0.5); }
.sddl-preview label { display: block; margin-top: 9px; color: rgba(var(--v-theme-on-surface), 0.55); }
.sddl-preview code { display: block; max-height: 80px; padding: 6px; overflow: auto; border-radius: 4px; background: rgba(var(--v-theme-on-surface), 0.05); font-size: 0.65rem; overflow-wrap: anywhere; user-select: text; }
.editor-actions { border-top: 1px solid rgba(var(--v-border-color), 0.12); padding: 10px 16px; }
@media (max-width: 640px) {
  .steps { padding-inline: 14px; }
  .step b { display: none; }
  .editor-body { min-height: 340px; padding-inline: 14px; }
  .account-row { align-items: flex-start; flex-wrap: wrap; }
  .account-copy { min-width: 150px; }
  .account-row :deep(.v-btn-toggle) { margin-left: 42px; }
}
</style>
