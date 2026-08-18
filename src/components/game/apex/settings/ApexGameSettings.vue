<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';
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
import {
  findApexBindingConflict,
  matchingApexGameSettingOptionValue,
} from '@/utils/game/apex_game_settings.ts';
import {useApexStore} from '@/stores/game/apex.ts';
import ApexNumberInput from '@/components/game/apex/common/ApexNumberInput.vue';
import ApexBindingSelect from './ApexBindingSelect.vue';
import ApexGameSettingTip from './ApexGameSettingTip.vue';
import ApexLaserSightColorInput from './ApexLaserSightColorInput.vue';
import ApexRgbIntegerInput from './ApexRgbIntegerInput.vue';

const apex_store = useApexStore();
const {locale, t, te} = useI18n();
const toast = useToast();
const bindingSlots = [0, 1] as const;
const sectionsScroll = ref<HTMLElement | null>(null);
const canScrollSectionsLeft = ref(false);
const canScrollSectionsRight = ref(false);
let sectionsResizeObserver: ResizeObserver | null = null;

function updateSectionScrollHints() {
  const scroller = sectionsScroll.value;
  if (!scroller) return;
  const maxScrollLeft = Math.max(scroller.scrollWidth - scroller.clientWidth, 0);
  canScrollSectionsLeft.value = scroller.scrollLeft > 1;
  canScrollSectionsRight.value = scroller.scrollLeft < maxScrollLeft - 1;
}

function scrollSections(direction: -1 | 1) {
  const scroller = sectionsScroll.value;
  if (!scroller) return;
  scroller.scrollBy({
    left: direction * Math.max(scroller.clientWidth * 0.72, 120),
    behavior: 'smooth',
  });
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    sectionsResizeObserver = new ResizeObserver(updateSectionScrollHints);
    if (sectionsScroll.value) {
      sectionsResizeObserver.observe(sectionsScroll.value);
      const track = sectionsScroll.value.firstElementChild;
      if (track) sectionsResizeObserver.observe(track);
    }
  }
  window.addEventListener('resize', updateSectionScrollHints);
  void nextTick(updateSectionScrollHints);
});

onBeforeUnmount(() => {
  sectionsResizeObserver?.disconnect();
  sectionsResizeObserver = null;
  window.removeEventListener('resize', updateSectionScrollHints);
});

watch(locale, () => {
  void nextTick(updateSectionScrollHints);
});

const section = computed({
  get: () => apex_store.game_settings_section === 'interface'
    ? 'hud'
    : apex_store.game_settings_section,
  set: value => { apex_store.game_settings_section = value as ApexGameSettingsSection; },
});
const search = computed({
  get: () => apex_store.game_settings_filter_search,
  set: value => { apex_store.game_settings_filter_search = String(value ?? ''); },
});
const query = computed(() => search.value.trim().toLowerCase());
const settingsBusy = computed(() => (
  apex_store.is_game_settings_saving
  || apex_store.is_game_settings_restoring
  || apex_store.is_config_snapshot_applying
  || apex_store.quick_preset_applying
));
function valueFor(field: ApexGameSettingDefinition): string {
  return apex_store.game_settings_values[field.file][field.readKey ?? field.key] ?? '';
}

function setValue(field: ApexGameSettingDefinition, value: string) {
  if (isDisabled(field)) return;
  for (const key of field.writeKeys ?? [field.key]) {
    apex_store.set_game_setting_value(field.file, key, value);
  }
}

function storageKeyLabel(field: ApexGameSettingDefinition): string {
  if (field.writeKeys?.length) {
    if (field.writeKeys.length === 1) return field.writeKeys[0];
    return `${field.writeKeys[0]}…${field.writeKeys[field.writeKeys.length - 1]}`;
  }
  return field.readKey ?? field.key;
}

function isDisabled(field: ApexGameSettingDefinition): boolean {
  if (settingsBusy.value) return true;
  if (!field.disabledWhen) return false;
  const dependencies = Array.isArray(field.disabledWhen)
    ? field.disabledWhen
    : [field.disabledWhen];
  return dependencies.some((dependency) => {
    const dependencyValue = apex_store.game_settings_values[dependency.file][dependency.key];
    if (dependencyValue !== '0' && dependencyValue !== '1') return true;
    return dependencyValue === dependency.value;
  });
}

function showSettingTip(field: ApexGameSettingDefinition) {
  apex_store.showTip({
    tip: ApexGameSettingTip,
    tipProps: {fieldId: field.id},
  });
}

function matchesField(field: ApexGameSettingDefinition): boolean {
  if (!query.value) return true;
  return [
    t(field.labelKey),
    t(field.descriptionKey),
    field.key,
    field.readKey,
    ...(field.writeKeys ?? []),
    valueFor(field),
  ]
    .join(' ')
    .toLowerCase()
    .includes(query.value);
}

const visibleFields = computed(() => ApexGameSettingsData.filter(field => (
  field.section === section.value
  && (field.readKey ?? field.key) in apex_store.game_settings_values[field.file]
  && matchesField(field)
)));

const knownKeys = new Set([
  ...ApexGameSettingsData.map(field => `${field.file}:${field.key}`),
  'profile:toggle_on_jump_to_deactivate_changed',
]);
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

interface ApexBindingAction {
  key: string;
  bindings: ApexBinding[];
  slots: [ApexBinding | undefined, ApexBinding | undefined];
  template: ApexBinding;
}

function bindingActionKey(binding: ApexBinding): string {
  return `${binding.command.toLowerCase()}\u001f${(binding.heldCommand ?? '').toLowerCase()}`;
}

const bindingActions = computed<ApexBindingAction[]>(() => {
  const grouped = new Map<string, ApexBinding[]>();
  for (const binding of apex_store.game_settings_bindings) {
    if (!binding.editable) continue;
    const key = bindingActionKey(binding);
    const group = grouped.get(key) ?? [];
    group.push(binding);
    grouped.set(key, group);
  }
  return Array.from(grouped, ([key, bindings]) => {
    const slots: ApexBindingAction['slots'] = [
      bindings.find(binding => binding.context === 0),
      bindings.find(binding => binding.context === 1),
    ];
    return {
      key,
      bindings,
      slots,
      template: bindings.find(binding => !binding.templateId) ?? bindings[0],
    };
  });
});

const visibleBindingActions = computed(() => bindingActions.value.filter(action => {
  if (!query.value) return true;
  return action.bindings.some(binding => (
    [bindingName(binding), binding.command, binding.heldCommand, binding.input]
      .join(' ')
      .toLowerCase()
      .includes(query.value)
  ));
}));

function updateBinding(action: ApexBindingAction, slot: 0 | 1, input: string) {
  if (settingsBusy.value) return;
  const binding = action.slots[slot];
  const conflict = input
    ? findApexBindingConflict(apex_store.game_settings_bindings, binding?.id ?? '', input)
    : undefined;
  if (conflict) {
    toast.error(t('apexGameSettings.bindingConflict', {key: input, action: bindingName(conflict)}));
    return;
  }
  apex_store.set_game_binding_slot(
    action.template.id,
    binding?.id ?? null,
    input,
    slot,
  );
}

function enumItems(field: ApexGameSettingDefinition) {
  return (field.options ?? []).map(option => ({
    value: option.value,
    title: t(option.labelKey),
  }));
}

function enumValueFor(field: ApexGameSettingDefinition): string {
  const value = valueFor(field);
  return matchingApexGameSettingOptionValue(field, value) ?? value;
}

</script>

<template>
  <div class="game-settings d-flex flex-column h-100 min-height-0">
    <div class="settings-toolbar">
      <div class="settings-sections-shell">
        <button
          type="button"
          class="settings-scroll-hint settings-scroll-hint--left"
          :class="{'settings-scroll-hint--visible': canScrollSectionsLeft}"
          :disabled="!canScrollSectionsLeft"
          :aria-hidden="!canScrollSectionsLeft"
          :aria-label="t('apexGameSettings.scrollSectionsLeft')"
          :tabindex="canScrollSectionsLeft ? 0 : -1"
          @click="scrollSections(-1)"
        >
          <v-icon icon="mdi-chevron-left" size="18"/>
        </button>
        <div
          ref="sectionsScroll"
          class="settings-sections-scroll"
          @scroll.passive="updateSectionScrollHints"
        >
          <v-btn-toggle
            v-model="section"
            mandatory
            density="compact"
            color="primary"
            variant="text"
            border
            divided
            class="settings-sections game-page-segmented-toggle"
          >
            <v-btn
              v-for="item in apexGameSettingsSections"
              :key="item"
              :value="item"
              size="small"
            >
              {{ t(`apexGameSettings.sections.${item}`) }}
            </v-btn>
          </v-btn-toggle>
        </div>
        <button
          type="button"
          class="settings-scroll-hint settings-scroll-hint--right"
          :class="{'settings-scroll-hint--visible': canScrollSectionsRight}"
          :disabled="!canScrollSectionsRight"
          :aria-hidden="!canScrollSectionsRight"
          :aria-label="t('apexGameSettings.scrollSectionsRight')"
          :tabindex="canScrollSectionsRight ? 0 : -1"
          @click="scrollSections(1)"
        >
          <v-icon icon="mdi-chevron-right" size="18"/>
        </button>
      </div>
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
    </div>

    <v-list class="settings-list flex-grow-1 min-height-0" lines="two">
      <template v-if="section !== 'bindings' && section !== 'unknown'">
        <v-list-item
          v-for="field in visibleFields"
          :key="field.id"
          class="setting-row game-page-row-tip-host"
          :class="{
            'setting-row--disabled': isDisabled(field),
            'setting-row--wide-control': field.control === 'packed-rgb',
          }"
          :title="t('apexLaunchOptions.ui.rightClickTip')"
          @contextmenu.prevent="showSettingTip(field)"
        >
          <template #title>
            <div class="setting-title-row">
              <span>{{ t(field.labelKey) }}</span>
              <code>{{ storageKeyLabel(field) }}</code>
              <v-btn
                icon="mdi-information-variant"
                density="compact"
                variant="text"
                class="mx-compact-icon-button game-page-row-tip-button"
                :aria-label="t('apexGameSettings.openTip', {setting: t(field.labelKey)})"
                @click.stop="showSettingTip(field)"
              />
            </div>
          </template>
          <template #subtitle><div class="setting-description">{{ t(field.descriptionKey) }}</div></template>
          <template #append>
            <div class="setting-row-append">
              <v-switch
                v-if="field.control === 'toggle'"
                :model-value="valueFor(field) === '1'"
                density="compact"
                color="primary"
                hide-details
                inset
                class="mx-compact-switch"
                :disabled="isDisabled(field)"
                :aria-label="t(field.labelKey)"
                @update:model-value="setValue(field, $event ? '1' : '0')"
              />
              <div v-else-if="field.control === 'enum'" class="setting-enum-scroll">
                <v-btn-toggle
                  :model-value="enumValueFor(field)"
                  mandatory
                  density="compact"
                  color="primary"
                  variant="text"
                  border
                  divided
                  class="setting-enum-toggle game-page-segmented-toggle"
                  :disabled="isDisabled(field)"
                  :aria-label="t(field.labelKey)"
                  @update:model-value="setValue(field, String($event))"
                >
                  <v-btn
                    v-for="option in enumItems(field)"
                    :key="option.value"
                    :value="option.value"
                    size="small"
                  >
                    {{ option.title }}
                  </v-btn>
                </v-btn-toggle>
              </div>
              <ApexRgbIntegerInput
                v-else-if="field.control === 'rgb'"
                :model-value="valueFor(field)"
                :label="t(field.labelKey)"
                :disabled="isDisabled(field)"
                @update:model-value="setValue(field, $event)"
              />
              <ApexLaserSightColorInput
                v-else-if="field.control === 'packed-rgb'"
                :model-value="valueFor(field)"
                :label="t(field.labelKey)"
                :disabled="isDisabled(field)"
                @update:model-value="setValue(field, $event)"
              />
              <ApexNumberInput
                v-else
                :model-value="valueFor(field)"
                :min="field.min"
                :max="field.max"
                :step="field.step"
                :aria-label="t(field.labelKey)"
                :disabled="isDisabled(field)"
                @update:model-value="setValue(field, String($event))"
              />
            </div>
          </template>
        </v-list-item>
      </template>

      <template v-else-if="section === 'bindings'">
        <v-list-item v-for="action in visibleBindingActions" :key="action.key" class="setting-row">
          <template #title>
            <div class="setting-title-row">
              <span>{{ bindingName(action.template) }}</span>
            </div>
          </template>
          <template #subtitle>
            <code>{{ action.template.command }}</code>
            <span v-if="action.template.heldCommand"> / {{ action.template.heldCommand }}</span>
          </template>
          <template #append>
            <div class="setting-row-append">
              <div class="binding-slots-scroll">
                <div class="binding-slots">
                  <ApexBindingSelect
                    v-for="slot in bindingSlots"
                    :key="action.slots[slot]?.id ?? `${action.key}:${slot}`"
                    :model-value="action.slots[slot]?.input ?? ''"
                    :action-label="bindingName(action.template)"
                    :slot-number="slot + 1"
                    :disabled="settingsBusy"
                    clearable
                    @update:model-value="updateBinding(action, slot, $event)"
                  />
                </div>
              </div>
            </div>
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
          <template #subtitle><div class="setting-description">{{ t('apexGameSettings.unknownDescription') }}</div></template>
          <template #append>
            <div class="setting-row-append">
              <code
                class="unknown-value"
                :title="entry.value"
                :aria-label="entry.value"
                tabindex="0"
              >{{ entry.value }}</code>
            </div>
          </template>
        </v-list-item>
      </template>

      <div
        v-if="(section === 'bindings' ? visibleBindingActions.length : section === 'unknown' ? unknownEntries.length : visibleFields.length) === 0"
        class="empty-state text-medium-emphasis"
      >
        {{ t('apexGameSettings.empty') }}
      </div>
    </v-list>
  </div>
</template>

<style scoped>
.min-height-0 { min-height: 0; }
.settings-toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 4px 10px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}
.settings-sections-shell {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: var(--app-control-height-compact);
}
.settings-sections-scroll {
  width: 100%;
  height: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}
.settings-scroll-hint {
  position: absolute;
  z-index: 2;
  top: 0;
  bottom: 0;
  display: flex;
  width: 36px;
  align-items: center;
  padding: 0;
  border: 0;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized),
    visibility var(--app-motion-base) step-end;
}
.settings-scroll-hint--visible {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: translateX(0);
  transition:
    opacity var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized),
    visibility 0ms step-start;
}
.settings-scroll-hint--left {
  left: 0;
  justify-content: flex-start;
  padding-left: 2px;
  background: linear-gradient(90deg, rgb(var(--v-theme-background)) 0 34%, rgba(var(--v-theme-background), 0.82) 62%, transparent 100%);
  transform: translateX(-4px);
}
.settings-scroll-hint--right {
  right: 0;
  justify-content: flex-end;
  padding-right: 2px;
  background: linear-gradient(270deg, rgb(var(--v-theme-background)) 0 34%, rgba(var(--v-theme-background), 0.82) 62%, transparent 100%);
  transform: translateX(4px);
}
.settings-scroll-hint--visible { transform: translateX(0); }
.settings-scroll-hint:hover :deep(.v-icon) { transform: scale(1.12); }
.settings-scroll-hint:active :deep(.v-icon) { transform: scale(0.9); }
.settings-scroll-hint :deep(.v-icon) {
  filter: drop-shadow(0 1px 2px rgba(var(--v-theme-background), 0.9));
  transition: transform var(--app-motion-fast) var(--app-ease-emphasized);
}
.settings-sections {
  width: max-content;
  min-width: 100%;
  max-width: none;
  height: var(--app-control-height-compact);
  min-height: var(--app-control-height-compact);
}
.settings-sections :deep(.v-btn) {
  flex: 1 0 auto;
  min-width: auto;
  padding-inline: 12px;
  color: rgba(var(--v-theme-on-surface), 0.62);
  transition: color var(--app-motion-fast) var(--app-ease-standard), transform var(--app-motion-fast) var(--app-ease-emphasized);
}
.settings-sections :deep(.v-btn__content) {
  width: 100%;
}
.settings-sections :deep(.v-btn--active) {
  color: rgb(var(--v-theme-primary)) !important;
}
.settings-sections :deep(.v-btn:hover:not(.v-btn--active)) { color: rgba(var(--v-theme-on-surface), 0.9); }
.settings-sections :deep(.v-btn:active) { transform: scale(0.98); }
.settings-search { flex: 0 1 240px; min-width: 150px; }
.settings-list { overflow-y: auto; padding: 2px 0 0; }
.setting-row {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.1);
  transition: background-color var(--app-motion-fast) var(--app-ease-standard);
}
.setting-row:hover,
.setting-row:focus-within { background: var(--app-hover); }
.setting-row :deep(.v-list-item__content) { min-width: 0; }
.setting-row :deep(.v-list-item-title) { white-space: normal; }
.setting-row :deep(.v-list-item__append) { align-self: center; min-width: 0; }
.setting-row--disabled :deep(.v-list-item__content) { opacity: 0.46; }
.setting-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 13px; font-weight: 650; line-height: 1.35; white-space: normal; }
.setting-title-row > span { min-width: 0; overflow-wrap: anywhere; }
.setting-title-row code { color: rgba(var(--v-theme-on-surface), 0.42); font-size: 11px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.setting-description { color: rgba(var(--v-theme-on-surface), 0.6); font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; white-space: normal; }
.setting-row-append { display: flex; align-items: center; min-width: 0; }
.settings-sections-scroll::-webkit-scrollbar,
.setting-enum-scroll::-webkit-scrollbar { display: none; }
.setting-enum-scroll { max-width: min(52vw, 460px); overflow-x: auto; scrollbar-width: none; }
.setting-enum-toggle { width: max-content; max-width: none; }
.setting-enum-toggle :deep(.v-btn) { flex: 0 0 auto; white-space: nowrap; }
.unknown-value { display: block; max-width: 220px; overflow: hidden; color: rgba(var(--v-theme-on-surface), 0.68); text-overflow: ellipsis; white-space: nowrap; }
.unknown-value:focus-visible { overflow: visible; outline-offset: 3px; white-space: normal; overflow-wrap: anywhere; }
.binding-slots-scroll { min-width: 0; overflow-x: auto; scrollbar-width: none; }
.binding-slots-scroll::-webkit-scrollbar { display: none; }
.binding-slots { display: grid; grid-template-columns: repeat(2, minmax(112px, 150px)); gap: 6px; min-width: 230px; }
.empty-state { display: grid; min-height: 160px; place-items: center; font-size: 13px; }
@media (max-width: 980px) {
  .setting-row--wide-control :deep(.v-list-item__content) { grid-column: 1 / -1; grid-row: 1; }
  .setting-row--wide-control :deep(.v-list-item__append) {
    grid-column: 1 / -1;
    grid-row: 2;
    width: 100%;
    padding-top: 6px;
    padding-inline-start: 0;
    justify-content: flex-start;
  }
  .setting-row--wide-control .setting-row-append { width: 100%; }
}
@media (max-width: 760px) {
  .settings-toolbar { flex-wrap: wrap; }
  .settings-sections-shell { flex-basis: 100%; order: 2; }
  .settings-search { flex: 1 1 180px; }
  .setting-title-row code { display: none; }
  .setting-row :deep(.v-list-item__content) { grid-column: 1 / -1; grid-row: 1; }
  .setting-row :deep(.v-list-item__append) {
    grid-column: 1 / -1;
    grid-row: 2;
    width: 100%;
    padding-top: 6px;
    padding-inline-start: 0;
    justify-content: flex-start;
  }
  .setting-row-append { width: 100%; }
  .setting-enum-scroll { max-width: 100%; }
  .binding-slots-scroll { width: 100%; }
  .unknown-value { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
}
@media (prefers-reduced-motion: reduce) {
  .settings-scroll-hint,
  .settings-scroll-hint :deep(.v-icon) { transition: none; }
}
</style>
