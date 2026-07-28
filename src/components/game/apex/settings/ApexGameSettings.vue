<script setup lang="ts">
import {computed, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import ApexGameSettingsData, {
  apexBindingCommandLabels,
  apexGameSettingsSections,
} from '@/data/apex_game_settings.ts';
import type {
  ApexBinding,
  ApexGameSettingDefinition,
  ApexGameSettingsFile,
  ApexGameSettingsSection,
} from '@/types/apex_game_settings.ts';
import {findApexBindingConflict} from '@/utils/game/apex_game_settings.ts';
import {useApexStore} from '@/stores/game/apex.ts';
import ApexBindingSelect from './ApexBindingSelect.vue';

const apex_store = useApexStore();
const {t, te} = useI18n();
const toast = useToast();
const restoreDialog = ref(false);
const restoreSettings = ref(false);
const restoreProfile = ref(false);

const section = computed({
  get: () => apex_store.game_settings_section,
  set: value => { apex_store.game_settings_section = value as ApexGameSettingsSection; },
});
const search = computed({
  get: () => apex_store.game_settings_filter_search,
  set: value => { apex_store.game_settings_filter_search = String(value ?? ''); },
});
const query = computed(() => search.value.trim().toLowerCase());
const report = computed(() => apex_store.game_settings_report);

function valueFor(field: ApexGameSettingDefinition): string {
  return apex_store.game_settings_values[field.file][field.key] ?? '';
}

function setValue(field: ApexGameSettingDefinition, value: string) {
  apex_store.set_game_setting_value(field.file, field.key, value);
}

function matchesField(field: ApexGameSettingDefinition): boolean {
  if (!query.value) return true;
  return [t(field.labelKey), t(field.descriptionKey), field.key, valueFor(field)]
    .join(' ')
    .toLowerCase()
    .includes(query.value);
}

const visibleFields = computed(() => ApexGameSettingsData.filter(field => (
  field.section === section.value
  && field.key in apex_store.game_settings_values[field.file]
  && matchesField(field)
)));

const knownKeys = new Set(ApexGameSettingsData.map(field => `${field.file}:${field.key}`));
const unknownEntries = computed(() => {
  const entries: {file: ApexGameSettingsFile; key: string; value: string}[] = [];
  for (const file of ['settings', 'profile'] as const) {
    for (const [key, value] of Object.entries(apex_store.game_settings_values[file])) {
      if (knownKeys.has(`${file}:${key}`)) continue;
      const haystack = `${file} ${key} ${value}`.toLowerCase();
      if (!query.value || haystack.includes(query.value)) entries.push({file, key, value});
    }
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key));
});

function bindingName(binding: ApexBinding): string {
  const suffix = apexBindingCommandLabels[binding.command];
  const key = suffix ? `apexGameSettings.bindings.${suffix}` : '';
  return key && te(key) ? t(key) : binding.command;
}

const visibleBindings = computed(() => apex_store.game_settings_bindings.filter(binding => {
  if (!query.value) return true;
  return [bindingName(binding), binding.command, binding.heldCommand, binding.input]
    .join(' ')
    .toLowerCase()
    .includes(query.value);
}));

function blockedInputs(binding: ApexBinding): string[] {
  return apex_store.game_settings_bindings
    .filter(item => item.id !== binding.id)
    .map(item => item.input);
}

function updateBinding(binding: ApexBinding, input: string) {
  const conflict = findApexBindingConflict(apex_store.game_settings_bindings, binding.id, input);
  if (conflict) {
    toast.error(t('apexGameSettings.bindingConflict', {key: input, action: bindingName(conflict)}));
    return;
  }
  apex_store.set_game_binding_input(binding.id, input);
}

function enumItems(field: ApexGameSettingDefinition) {
  return (field.options ?? []).map(option => ({
    value: option.value,
    title: t(option.labelKey),
  }));
}

function openRestore() {
  restoreSettings.value = !!report.value?.settings.backupAvailable;
  restoreProfile.value = !!report.value?.profile.backupAvailable;
  restoreDialog.value = true;
}

async function confirmRestore() {
  if (!restoreSettings.value && !restoreProfile.value) return;
  if (await apex_store.restore_apex_game_settings(restoreSettings.value, restoreProfile.value)) {
    restoreDialog.value = false;
  }
}
</script>

<template>
  <div class="game-settings d-flex flex-column h-100 min-height-0">
    <div class="settings-toolbar">
      <v-tabs
        v-model="section"
        density="compact"
        show-arrows
        inset
        color="primary"
        class="settings-tabs"
      >
        <v-tab v-for="item in apexGameSettingsSections" :key="item" :value="item">
          {{ t(`apexGameSettings.sections.${item}`) }}
        </v-tab>
      </v-tabs>
      <v-text-field
        v-model="search"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        prepend-inner-icon="mdi-magnify"
        :placeholder="t('apexGameSettings.search')"
        :aria-label="t('apexGameSettings.search')"
        class="mx-search-field settings-search"
      />
      <v-btn
        icon="mdi-restore"
        size="small"
        variant="text"
        :disabled="!report?.settings.backupAvailable && !report?.profile.backupAvailable"
        :aria-label="t('apexGameSettings.restore')"
        :title="t('apexGameSettings.restore')"
        @click="openRestore"
      />
    </div>

    <v-list class="settings-list flex-grow-1 min-height-0" lines="two">
      <template v-if="section !== 'bindings' && section !== 'unknown'">
        <v-list-item v-for="field in visibleFields" :key="field.id" class="setting-row">
          <template #title>
            <div class="setting-title-row">
              <span>{{ t(field.labelKey) }}</span>
              <code>{{ field.key }}</code>
            </div>
          </template>
          <template #subtitle>{{ t(field.descriptionKey) }}</template>
          <template #append>
            <v-switch
              v-if="field.control === 'toggle'"
              :model-value="valueFor(field) === '1'"
              density="compact"
              color="primary"
              hide-details
              inset
              :aria-label="t(field.labelKey)"
              @update:model-value="setValue(field, $event ? '1' : '0')"
            />
            <v-select
              v-else-if="field.control === 'enum'"
              :model-value="valueFor(field)"
              :items="enumItems(field)"
              item-title="title"
              item-value="value"
              density="compact"
              variant="outlined"
              hide-details
              class="setting-control setting-select"
              :aria-label="t(field.labelKey)"
              @update:model-value="setValue(field, String($event))"
            />
            <v-text-field
              v-else
              :model-value="valueFor(field)"
              type="number"
              :min="field.min"
              :max="field.max"
              :step="field.step"
              density="compact"
              variant="outlined"
              hide-details
              class="setting-control setting-number"
              :aria-label="t(field.labelKey)"
              @update:model-value="setValue(field, String($event ?? ''))"
            />
          </template>
        </v-list-item>
      </template>

      <template v-else-if="section === 'bindings'">
        <v-list-item v-for="binding in visibleBindings" :key="binding.id" class="setting-row">
          <template #title>
            <div class="setting-title-row">
              <span>{{ bindingName(binding) }}</span>
              <v-chip v-if="!binding.editable" size="x-small" variant="tonal">
                {{ t('apexGameSettings.readOnly') }}
              </v-chip>
            </div>
          </template>
          <template #subtitle>
            <code>{{ binding.command }}</code>
            <span v-if="binding.heldCommand"> / {{ binding.heldCommand }}</span>
          </template>
          <template #append>
            <ApexBindingSelect
              v-if="binding.editable"
              :model-value="binding.input"
              :blocked-inputs="blockedInputs(binding)"
              @update:model-value="updateBinding(binding, $event)"
            />
            <code v-else class="binding-readonly">{{ binding.input }}</code>
          </template>
        </v-list-item>
      </template>

      <template v-else>
        <v-list-item v-for="entry in unknownEntries" :key="`${entry.file}:${entry.key}`" class="setting-row">
          <template #title>
            <div class="setting-title-row">
              <span>{{ entry.key }}</span>
              <v-chip size="x-small" variant="tonal">{{ entry.file }}.cfg</v-chip>
            </div>
          </template>
          <template #subtitle>{{ t('apexGameSettings.unknownDescription') }}</template>
          <template #append><code class="unknown-value">{{ entry.value }}</code></template>
        </v-list-item>
      </template>

      <div
        v-if="(section === 'bindings' ? visibleBindings.length : section === 'unknown' ? unknownEntries.length : visibleFields.length) === 0"
        class="empty-state text-medium-emphasis"
      >
        {{ t('apexGameSettings.empty') }}
      </div>
    </v-list>

    <v-dialog v-model="restoreDialog" max-width="420">
      <v-card :title="t('apexGameSettings.restore')">
        <v-card-text>
          <v-checkbox
            v-model="restoreSettings"
            :disabled="!report?.settings.backupAvailable"
            density="compact"
            hide-details
            label="settings.cfg"
          />
          <v-checkbox
            v-model="restoreProfile"
            :disabled="!report?.profile.backupAvailable"
            density="compact"
            hide-details
            label="profile.cfg"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="text" @click="restoreDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn
            color="warning"
            :loading="apex_store.is_game_settings_restoring"
            :disabled="!restoreSettings && !restoreProfile"
            @click="confirmRestore"
          >
            {{ t('apexGameSettings.restoreAction') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.min-height-0 { min-height: 0; }
.settings-toolbar { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 0 4px 8px; }
.settings-tabs {
  flex: 1 1 auto;
  min-width: 0;
  --v-tabs-slider-background: rgb(var(--v-theme-primary-container));
}
.settings-tabs :deep(.v-tab) {
  min-width: auto;
  padding-inline: 12px;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 12px;
  letter-spacing: 0;
  transition: color var(--app-motion-fast) var(--app-ease-standard), transform var(--app-motion-fast) var(--app-ease-emphasized);
}
.settings-tabs :deep(.v-tab--selected) { color: rgb(var(--v-theme-on-primary-container)) !important; }
.settings-tabs :deep(.v-tab:hover:not(.v-tab--selected)) { color: rgba(var(--v-theme-on-surface), 0.9); }
.settings-tabs :deep(.v-tab:active) { transform: scale(0.98); }
.settings-search { flex: 0 1 240px; min-width: 150px; }
.settings-list { overflow-y: auto; padding: 0; }
.setting-row { border-bottom: 1px solid rgba(var(--v-border-color), 0.1); }
.setting-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 14px; }
.setting-title-row code { color: rgba(var(--v-theme-on-surface), 0.45); font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.setting-control { width: 150px; min-width: 120px; }
.setting-number { max-width: 130px; }
.binding-readonly, .unknown-value { display: block; max-width: 220px; overflow: hidden; color: rgba(var(--v-theme-on-surface), 0.68); text-overflow: ellipsis; white-space: nowrap; }
.empty-state { display: grid; min-height: 160px; place-items: center; font-size: 13px; }
@media (max-width: 760px) {
  .settings-toolbar { flex-wrap: wrap; }
  .settings-tabs { flex-basis: 100%; order: 2; }
  .settings-search { flex: 1 1 180px; }
  .setting-title-row code { display: none; }
  .setting-control { width: 120px; }
}
</style>
