<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import ApexVideoConfigData from '@/data/apex_video_config.ts';
import {
  type ApexVideoConfigField,
  type ApexVideoConfigImpl,
  collectVideoConfigIdentifiers,
  isApexVideoConfigImpl,
} from '@/types/apex.ts';
import {ApexFilterEnum} from '@/enum.ts';
import apexStore from '@/stores/game/apex.ts';
import ApexNumberInput from '@/components/game/apex/common/ApexNumberInput.vue';
import ApexVideoConfigFilter from '@/components/game/apex/video_config/ApexVideoConfigFilter.vue';
import ApexVideoConfigLockFab from '@/components/game/apex/video_config/ApexVideoConfigLockFab.vue';
import ApexGammaBrightnessSlider from '@/components/game/apex/video_config/ApexGammaBrightnessSlider.vue';
import ApexDvsFpsSlider from '@/components/game/apex/video_config/ApexDvsFpsSlider.vue';
import ApexCsmPanel from '@/components/game/apex/video_config/ApexCsmPanel.vue';
import { APEX_GAMMA_REFERENCE, formatGammaDisplay } from '@/utils/apex_gamma.ts';
import ApexListItemBadges from '@/components/game/apex/common/ApexListItemBadges.vue';

const apex_store = apexStore();
const { t } = useI18n();

const SEARCH_MATCH_LOCALES = ['zh-CN', 'en-US'] as const;
const subtitle_overflow_map = ref<Record<string, boolean>>({});
const hovered_subtitle_id = ref<string | null>(null);
const subtitle_elements = new Map<string, HTMLElement>();
let subtitle_resize_observer: ResizeObserver | null = null;

function translateText(key?: string) {
  if (!key) return '';
  if (key.startsWith('apexVideoConfig.') || key.startsWith('apexLaunchOptions.')) return t(key);
  return key;
}

function bilingualSearchText(key?: string): string {
  if (!key) return '';
  if (!key.startsWith('apexVideoConfig.') && !key.startsWith('apexLaunchOptions.')) return key;
  return SEARCH_MATCH_LOCALES.map((loc) => t(key, { locale: loc })).join(' ');
}

type ConfigRow = ApexVideoConfigImpl | string;

function splitConfigIntoGroups(config: ConfigRow[]): { categoryKey: string; items: ApexVideoConfigImpl[] }[] {
  const groups: { categoryKey: string; items: ApexVideoConfigImpl[] }[] = [];
  let categoryKey: string | null = null;
  let items: ApexVideoConfigImpl[] = [];
  for (const row of config) {
    if (!isApexVideoConfigImpl(row)) {
      if (categoryKey !== null) {
        groups.push({ categoryKey, items });
      }
      categoryKey = row;
      items = [];
    } else {
      items.push(row);
    }
  }
  if (categoryKey !== null) {
    groups.push({ categoryKey, items });
  }
  return groups;
}

function isHiddenInNormalFilter(item: ApexVideoConfigImpl): boolean {
  if (item.hide_in_normal_filter) return true;
  // enum 行由 options 决定显隐，底层 fields 仅用于单独输入模式，不参与整行过滤
  if (item.valueType === 'enum') {
    return false;
  }
  if (item.fields?.length) {
    return item.fields.every((field) => field.hide_in_normal_filter);
  }
  return false;
}

function visibleFields(item: ApexVideoConfigImpl, normalOnly: boolean): ApexVideoConfigField[] {
  if (!item.fields?.length) return [];
  if (!normalOnly) return item.fields;
  return item.fields.filter((field) => !field.hide_in_normal_filter);
}

function itemSearchHaystack(item: ApexVideoConfigImpl): string {
  return [
    bilingualSearchText(item.name),
    item.description ? bilingualSearchText(item.description) : '',
    ...collectVideoConfigIdentifiers(item).map((id) => `${id} ${apex_store.get_video_config_value(id)}`),
  ].join(' ').toLowerCase();
}

function matchesItemSearch(item: ApexVideoConfigImpl, q: string): boolean {
  if (!q) return true;
  return itemSearchHaystack(item).includes(q);
}

const displayedVideoConfig = computed((): ConfigRow[] => {
  const q = (apex_store.video_filter_search ?? '').trim().toLowerCase();
  const normalOnly = !q && apex_store.video_filter_type === ApexFilterEnum.normal;
  const groups = splitConfigIntoGroups(ApexVideoConfigData as ConfigRow[]);
  const out: ConfigRow[] = [];

  for (const { categoryKey, items } of groups) {
    const typeFiltered = items.filter((item) => !(normalOnly && isHiddenInNormalFilter(item)));
    let visibleItems: ApexVideoConfigImpl[];
    if (!q) {
      visibleItems = typeFiltered;
    } else if (bilingualSearchText(categoryKey).toLowerCase().includes(q)) {
      visibleItems = typeFiltered;
    } else {
      visibleItems = typeFiltered.filter((item) => matchesItemSearch(item, q));
    }
    if (visibleItems.length === 0) continue;
    out.push(categoryKey);
    out.push(...visibleItems);
  }
  return out;
});

function clampFieldNumber(field: ApexVideoConfigField, value: number): number {
  let v = value;
  if (field.min != null) v = Math.max(field.min, v);
  if (field.max != null) v = Math.min(field.max, v);
  return v;
}

function clampItemNumber(item: ApexVideoConfigImpl, value: number): number {
  let v = value;
  if (item.min != null) v = Math.max(item.min, v);
  if (item.max != null) v = Math.min(item.max, v);
  return v;
}

function onFieldNumberInput(field: ApexVideoConfigField, value: number) {
  apex_store.set_video_config_number(
    field.identifier,
    clampFieldNumber(field, value),
    field.valueType === 'integer' ? 'integer' : 'float',
  );
}

function onItemNumberInput(item: ApexVideoConfigImpl, value: number) {
  apex_store.set_video_config_number(
    item.identifier,
    clampItemNumber(item, value),
    item.valueType === 'integer' ? 'integer' : 'float',
  );
}

function enumModel(item: ApexVideoConfigImpl): number | null {
  const idx = apex_store.get_video_config_enum(item);
  return idx < 0 ? null : idx;
}

function onEnumInput(item: ApexVideoConfigImpl, value: number | null) {
  if (value == null || value < 0) return;
  apex_store.set_video_config_enum(item, Number(value));
}

function isOutOfPresetSelected(item: ApexVideoConfigImpl): boolean {
  const idx = apex_store.get_video_config_enum(item);
  return idx >= 0 && !!item.options?.[idx]?.outOfPreset;
}

function fieldLabel(field: ApexVideoConfigField): string {
  if (field.inlineLabel) return translateText(field.inlineLabel);
  return field.identifier.replace(/^setting\./, '');
}

function parameterInfoText(item: ApexVideoConfigImpl): string {
  if (item.uiType === 'brightness') {
    const gamma = apex_store.get_video_config_number('setting.gamma', APEX_GAMMA_REFERENCE);
    return `setting.gamma ${formatGammaDisplay(gamma)}`;
  }
  return apex_store.get_video_config_parameter_info(item);
}

function showNormalOnly(): boolean {
  if (apex_store.video_individual_input) return false;
  return apex_store.video_filter_type === ApexFilterEnum.normal
    && !(apex_store.video_filter_search ?? '').trim();
}

function showInlineFields(item: ApexVideoConfigImpl): boolean {
  if (!item.fields?.length) return false;
  return !apex_store.video_individual_input || !!item.keep_inline_on_individual_input;
}

function linkedFieldsForItem(item: ApexVideoConfigImpl): ApexVideoConfigField[] {
  if (!apex_store.video_individual_input || !item.fields?.length) return [];
  if (item.keep_inline_on_individual_input) return [];
  return visibleFields(item, false).filter((field) => !field.hide_in_linked_panel);
}

function hasLinkedFieldsPanel(item: ApexVideoConfigImpl): boolean {
  return linkedFieldsForItem(item).length > 0;
}

function subtitleText(item: ApexVideoConfigImpl): string {
  return item.description ? translateText(item.description) : item.identifier;
}

function subtitleNeedsMarquee(item: ApexVideoConfigImpl): boolean {
  return !!subtitle_overflow_map.value[item.identifier];
}

let subtitle_refresh_raf = 0;

function refreshSubtitleOverflow() {
  if (subtitle_refresh_raf) return;
  subtitle_refresh_raf = requestAnimationFrame(() => {
    subtitle_refresh_raf = 0;
    const next: Record<string, boolean> = {};
    for (const [id, el] of subtitle_elements.entries()) {
      next[id] = el.scrollWidth > el.clientWidth + 1;
    }
    subtitle_overflow_map.value = next;
  });
}

function resolveSubtitleElement(el: unknown): HTMLElement | null {
  if (el instanceof HTMLElement) return el;
  const maybe_el = (el as { $el?: unknown } | null)?.$el;
  if (maybe_el instanceof HTMLElement) return maybe_el;
  return null;
}

function setSubtitleElement(identifier: string, el: unknown) {
  const prev = subtitle_elements.get(identifier);
  if (prev && subtitle_resize_observer) {
    subtitle_resize_observer.unobserve(prev);
  }
  const html = resolveSubtitleElement(el);
  if (!html) {
    subtitle_elements.delete(identifier);
    return;
  }
  subtitle_elements.set(identifier, html);
  if (subtitle_resize_observer) {
    subtitle_resize_observer.observe(html);
  }
}

function onSubtitleEnter(identifier: string) {
  hovered_subtitle_id.value = identifier;
}

function onSubtitleLeave(identifier: string) {
  if (hovered_subtitle_id.value === identifier) {
    hovered_subtitle_id.value = null;
  }
}

onMounted(async () => {
  subtitle_resize_observer = new ResizeObserver(() => {
    refreshSubtitleOverflow();
  });
  await nextTick();
  for (const el of subtitle_elements.values()) {
    subtitle_resize_observer.observe(el);
  }
  refreshSubtitleOverflow();
});

watch(displayedVideoConfig, async () => {
  await nextTick();
  refreshSubtitleOverflow();
}, { flush: 'post' });

onBeforeUnmount(() => {
  if (subtitle_refresh_raf) {
    cancelAnimationFrame(subtitle_refresh_raf);
    subtitle_refresh_raf = 0;
  }
  subtitle_resize_observer?.disconnect();
  subtitle_resize_observer = null;
});
</script>

<template>
  <div class="d-flex flex-column h-100 min-height-0">
    <ApexVideoConfigFilter/>
    <v-list
      class="rounded-0 apex-options-list flex-grow-1 min-height-0"
      style="overflow-y: auto"
    >
      <template v-for="item in displayedVideoConfig" :key="isApexVideoConfigImpl(item) ? item.identifier : item">
        <template v-if="isApexVideoConfigImpl(item)">
          <div class="apex-list-item-wrap" :title="item.tip ? t('apexLaunchOptions.ui.rightClickTip') : undefined">
          <v-list-item
            @contextmenu.prevent="item.tip && apex_store.showTip(item as any)"
          >
            <template v-slot:title>
              <div class="d-flex flex-row align-center">
                <p style="font-size: 15px">{{ translateText(item.name) }}</p>
                <ApexListItemBadges
                  :uncommon="isHiddenInNormalFilter(item)"
                  :not-in-game-settings="!!item.not_in_game_settings"
                />
                <v-chip
                  v-if="item.is_new"
                  color="error"
                  size="x-small"
                  variant="flat"
                  class="ml-2 font-weight-bold px-1"
                  style="height: 16px; font-size: 10px;"
                >
                  NEW
                </v-chip>
                <v-chip
                  v-if="isOutOfPresetSelected(item)"
                  color="warning"
                  size="x-small"
                  variant="flat"
                  prepend-icon="mdi-lock-alert"
                  class="ml-2 font-weight-bold px-1"
                  style="height: 16px; font-size: 10px;"
                >
                  {{ t('apex.outOfPresetBadge') }}
                </v-chip>
                <v-spacer/>
                <p class="parameter_info text-truncate">{{ parameterInfoText(item) }}</p>
              </div>
            </template>
            <template v-slot:subtitle>
              <div class="video-subtitle-wrap">
                <div class="video-subtitle-main-row">
                  <div class="video-subtitle-marquee" :class="{ 'is-scrolling': subtitleNeedsMarquee(item) }">
                    <span
                      :ref="(el) => setSubtitleElement(item.identifier, el)"
                      :class="{ 'subtitle-scroll-active': subtitleNeedsMarquee(item) && hovered_subtitle_id === item.identifier }"
                      @mouseenter="onSubtitleEnter(item.identifier)"
                      @mouseleave="onSubtitleLeave(item.identifier)"
                    >
                      {{ subtitleText(item) }}
                    </span>
                  </div>
                  <div v-if="item.uiType !== 'csm'" class="video-controls-row" @click.stop="">
                  <template v-if="item.valueType === 'enum'">
                    <div class="video-enum-wrap d-flex flex-row align-center flex-wrap justify-end">
                      <v-btn-toggle
                        :model-value="enumModel(item)"
                        @update:model-value="onEnumInput(item, $event as number | null)"
                        color="primary"
                        variant="text"
                        class="apex-parameter-toggle"
                        style="max-height: 25px"
                        border
                        divided
                      >
                        <v-btn
                          v-for="(option, idx) in item.options"
                          :key="option.label"
                          size="small"
                          :value="idx"
                          :color="option.outOfPreset ? 'warning' : undefined"
                          :prepend-icon="option.outOfPreset ? 'mdi-lock-alert' : undefined"
                          :class="{ 'apex-out-of-preset-btn': option.outOfPreset }"
                        >
                          {{ translateText(option.label) }}
                        </v-btn>
                      </v-btn-toggle>
                    </div>
                  </template>
                  <template v-else-if="item.uiType === 'dvsFpsTarget'">
                    <ApexDvsFpsSlider variant="compact" />
                  </template>
                  <template v-else-if="showInlineFields(item)">
                    <div class="video-fields-row d-flex flex-row align-center flex-wrap">
                      <template v-for="field in visibleFields(item, showNormalOnly())" :key="field.identifier">
                        <template v-if="field.valueType === 'boolean'">
                          <div class="video-field-inline d-flex flex-row align-center">
                            <v-switch
                              :model-value="apex_store.get_video_config_bool(field.identifier, field.onValue)"
                              @update:model-value="apex_store.set_video_config_bool(field.identifier, !!$event, field.onValue, field.offValue)"
                              hide-details
                              density="compact"
                              inset
                              color="primary"
                              class="apex-parameter-switch"
                            />
                          </div>
                        </template>
                        <template v-else>
                          <div class="video-field-inline d-flex flex-row align-center">
                            <span v-if="field.inlineLabel" class="input_inline_label">
                              {{ fieldLabel(field) }}
                            </span>
                            <div class="video-number-input">
                              <ApexNumberInput
                                :model-value="apex_store.get_video_config_number(field.identifier)"
                                :step="field.step ?? (field.valueType === 'integer' ? 1 : 0.1)"
                                :min="field.min"
                                :max="field.max"
                                @update:model-value="onFieldNumberInput(field, Number($event))"
                              />
                            </div>
                          </div>
                        </template>
                      </template>
                    </div>
                  </template>
                  <template v-else-if="item.valueType === 'boolean' && !item.fields?.length">
                    <v-switch
                      :model-value="apex_store.get_video_config_bool(item.identifier, item.onValue)"
                      @update:model-value="apex_store.set_video_config_bool(item.identifier, !!$event, item.onValue, item.offValue)"
                      hide-details
                      density="compact"
                      inset
                      color="primary"
                      class="apex-parameter-switch"
                    />
                  </template>
                  <template v-else-if="item.uiType === 'brightness'">
                    <ApexGammaBrightnessSlider variant="compact" />
                  </template>
                  <template v-else-if="!item.fields?.length">
                    <div class="video-number-input">
                      <ApexNumberInput
                        :model-value="apex_store.get_video_config_number(item.identifier)"
                        :step="item.step ?? (item.valueType === 'integer' ? 1 : 0.1)"
                        :min="item.min"
                        :max="item.max"
                        @update:model-value="onItemNumberInput(item, Number($event))"
                      />
                    </div>
                  </template>
                  </div>
                </div>
                <ApexCsmPanel v-if="item.uiType === 'csm'" :item="item" />
                <div
                  v-if="hasLinkedFieldsPanel(item)"
                  class="video-linked-fields-box"
                  @click.stop=""
                >
                  <div
                    v-for="field in linkedFieldsForItem(item)"
                    :key="field.identifier"
                    class="video-linked-field-row"
                  >
                    <span class="video-linked-field-label">{{ fieldLabel(field) }}</span>
                    <div class="video-linked-field-control">
                      <template v-if="field.valueType === 'boolean'">
                        <v-switch
                          :model-value="apex_store.get_video_config_bool(field.identifier, field.onValue)"
                          @update:model-value="apex_store.set_video_config_bool(field.identifier, !!$event, field.onValue, field.offValue)"
                          hide-details
                          density="compact"
                          inset
                          color="primary"
                          class="apex-parameter-switch apex-linked-switch"
                        />
                      </template>
                      <div v-else class="video-number-input">
                        <ApexNumberInput
                          :model-value="apex_store.get_video_config_number(field.identifier)"
                          :step="field.step ?? (field.valueType === 'integer' ? 1 : 0.1)"
                          :min="field.min"
                          :max="field.max"
                          @update:model-value="onFieldNumberInput(field, Number($event))"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </v-list-item>
          </div>
          <v-divider inset/>
        </template>
        <template v-else>
          <v-list-subheader class="apex-category px-4">
            <div class="apex-category-inner">
              <span class="apex-category-text">{{ t(item) }}</span>
            </div>
          </v-list-subheader>
        </template>
      </template>
    </v-list>
    <ApexVideoConfigLockFab/>
  </div>
</template>

<style scoped>
.min-height-0 {
  min-height: 0;
}

.parameter_info {
  color: #757575;
  font-size: 13px;
  text-align: right;
  max-width: 56%;
  white-space: nowrap;
}

.input_inline_label {
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  margin-right: 4px;
  white-space: nowrap;
}

.video-fields-row {
  gap: 8px;
  max-width: 100%;
}

.video-subtitle-wrap {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.video-subtitle-main-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.video-linked-fields-box {
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}

.video-linked-field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
}

.video-linked-field-row + .video-linked-field-row {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.video-linked-field-label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.video-linked-field-control {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

:deep(.apex-linked-switch.v-switch) {
  opacity: 0.85;
}

.video-subtitle-marquee {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: hidden;
  white-space: nowrap;
}

.video-subtitle-marquee > span {
  display: inline-block;
}

.video-subtitle-marquee.is-scrolling > span.subtitle-scroll-active {
  padding-left: 100%;
  animation: subtitle-marquee 10s linear infinite;
}

.video-controls-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  margin-left: auto;
  min-height: 28px;
}

.video-field-inline {
  gap: 4px;
}

.video-enum-wrap {
  gap: 4px;
  max-width: 100%;
}

:deep(.apex-out-of-preset-btn) {
  color: rgb(var(--v-theme-warning)) !important;
}

.apex-list-item-wrap {
  position: relative;
}

.apex-options-list {
  padding: 0;
}

.apex-category {
  position: sticky;
  top: 0;
  z-index: 6;
  min-height: 30px;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.apex-category-inner {
  width: 100%;
  display: flex;
  align-items: center;
  min-height: 30px;
}

.apex-category-text {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.video-number-input {
  min-width: 88px;
  max-width: 120px;
}

:deep(.apex-parameter-toggle .v-btn-group) {
  flex-wrap: nowrap;
}

:deep(.apex-parameter-switch.v-switch) {
  --v-input-control-height: 25px;
  flex: 0 0 auto;
}

:deep(.apex-parameter-switch.v-switch .v-selection-control) {
  min-height: 25px;
}

:deep(.apex-parameter-switch.v-switch--inset .v-switch__track) {
  height: 18px;
  min-width: 32px;
  padding: 0 2px;
}

:deep(.apex-parameter-switch.v-switch--inset .v-switch__thumb) {
  height: 14px;
  width: 14px;
  transform: scale(calc(10 / 14));
}

:deep(.apex-parameter-switch.v-switch--inset:not(.v-input--disabled) .v-selection-control:not(.v-selection-control--dirty) .v-switch__thumb) {
  background-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

:deep(.apex-parameter-switch.v-switch--inset .v-selection-control--dirty .v-switch__thumb),
:deep(.apex-parameter-switch.v-switch--inset .v-switch__thumb--filled) {
  transform: none;
}

@keyframes subtitle-marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-100%); }
}
</style>
