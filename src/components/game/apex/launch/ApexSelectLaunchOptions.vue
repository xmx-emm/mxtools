<script setup lang="ts">


import {computed, ref, watch} from 'vue';
import {ApexFilterEnum} from '@/enum.ts';
import {useI18n} from 'vue-i18n';
import ApexLaunchOptionsConfig from '@/data/apex_launch_options_config.ts';
import {isSteamLaunchOptionsImpl, SteamLaunchOptionsImpl} from '@/types/steam.ts';
import ApexLanguage from '@/components/game/apex/launch/language/ApexLanguage.vue';
import ApexForcedResolutionPreset from '@/components/game/apex/launch/preset/ApexForcedResolutionPreset.vue';
import ApexAspectPreset from '@/components/game/apex/launch/preset/ApexAspectPreset.vue';
import ApexFpsPreset from '@/components/game/apex/launch/preset/ApexFpsPreset.vue';
import ApexNumberInput from '@/components/game/apex/common/ApexNumberInput.vue';
import apexStore from '@/stores/game/apex.ts';
import {useSettingsStore} from '@/stores/settings.ts';
import ApexLobbyFpsPreset from '@/components/game/apex/launch/preset/ApexLobbyFpsPreset.vue';
import ApexFilter from '@/components/game/apex/launch/ApexFilter.vue';
import ApexListItemBadges from '@/components/game/apex/common/ApexListItemBadges.vue';

const apex_store = apexStore();
const settings_store = useSettingsStore();
const { t } = useI18n();

const listWrapRef = ref<HTMLElement | null>(null);
const lockedListHeight = ref<number | null>(null);

watch(
  () => apex_store.is_start_loading,
  (loading) => {
    if (loading) {
      lockedListHeight.value = listWrapRef.value?.offsetHeight ?? null;
    } else {
      lockedListHeight.value = null;
    }
  },
);

const listWrapStyle = computed(() =>
  lockedListHeight.value != null ? { minHeight: `${lockedListHeight.value}px` } : undefined,
);

/** 搜索时同时匹配 zh-CN / en-US 文案(与当前界面语言无关) */
const SEARCH_MATCH_LOCALES = ['zh-CN', 'en-US'] as const;

function translateApexLaunchOptionText(key?: string) {
  if (!key) return '';
  if (key.startsWith('apexLaunchOptions.') || key.startsWith('apexVideoConfig.')) return t(key);
  return key;
}

function bilingualSearchText(key?: string): string {
  if (!key) return '';
  if (!key.startsWith('apexLaunchOptions.') && !key.startsWith('apexVideoConfig.')) return key;
  return SEARCH_MATCH_LOCALES.map((loc) => t(key, { locale: loc })).join(' ');
}

function parameterTooltipText(pi: SteamLaunchOptionsImpl) {
  const raw = pi.requirement_description || pi.description || pi.identifier;
  return translateApexLaunchOptionText(
    typeof raw === 'string' ? raw : undefined
  );
}

function launchOptionKey(pi: SteamLaunchOptionsImpl): string {
  if (pi.name) return pi.name;
  if (typeof pi.parameter === 'string') return pi.parameter;
  if (Array.isArray(pi.parameter)) return pi.parameter.join('|');
  return '';
}

/**
 * 检查前置条件
 */
function checkRequirement(item: SteamLaunchOptionsImpl): boolean {
  if (item?.requirement) {
    if (typeof item.requirement === 'string') {
      return apex_store.launch_options.includes(item.requirement);
    } else if (typeof item.requirement === 'object') {
      for (const r of item.requirement) {
        if (apex_store.launch_options.includes(r)) {
          return true;
        }
      }
    } else if (typeof item.requirement === 'function') {
      return item.requirement();
    }
  }
  return false;
}


const is_download_button_danger = computed(() => {
  const color = String(apex_store.download_language_button_color || '').toLowerCase();
  return color === 'red' || color === 'error';
});

function open_miles_language_download_help() {
  if (apex_store.active_account_is_ea) {
    apex_store.download_miles_language_manual_dialog_ea = true;
  } else {
    apex_store.download_miles_language_semi_automatic_dialog = true;
  }
}

function check_item(item: SteamLaunchOptionsImpl) {
  // 用户勾选 is_new 选项时,记录为已见过,下次启动不再显示 NEW
  if (item?.is_new && item?.identifier) {
    settings_store.markApexNewItemSeen(item.identifier);
  }
}

watch(
  () => apex_store.options_selection,
  () => {
    apex_store.update_download_language_button_color();
  },
  { deep: true }
);

type ApexConfigRow = SteamLaunchOptionsImpl | string;

function itemSearchHaystack(item: SteamLaunchOptionsImpl): string {
  const chunks: string[] = [
    bilingualSearchText(item.name),
    item.description ? bilingualSearchText(item.description) : '',
  ];
  if (item.identifier) {
    chunks.push(item.identifier);
  }
  if (item.default_parameter) {
    chunks.push(item.default_parameter);
  }
  if (typeof item.parameter === 'string') {
    chunks.push(item.parameter);
  } else if (Array.isArray(item.parameter)) {
    chunks.push(...item.parameter);
  }
  if (item.parameters) {
    for (const sub of item.parameters) {
      chunks.push(itemSearchHaystack(sub));
    }
  }
  return chunks.join(' ').toLowerCase();
}

function matchesItemSearch(item: SteamLaunchOptionsImpl, q: string): boolean {
  if (!q) return true;
  return itemSearchHaystack(item).includes(q);
}

function splitConfigIntoGroups(config: ApexConfigRow[]): { categoryKey: string; items: SteamLaunchOptionsImpl[] }[] {
  const groups: { categoryKey: string; items: SteamLaunchOptionsImpl[] }[] = [];
  let categoryKey: string | null = null;
  let items: SteamLaunchOptionsImpl[] = [];
  for (const row of config) {
    if (!isSteamLaunchOptionsImpl(row)) {
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

const displayedLaunchOptions = computed((): ApexConfigRow[] => {
  const q = (apex_store.filter_search ?? '').trim().toLowerCase();
  /** 有搜索关键词时按「全部」范围检索(含仅「常用」下隐藏的项) */
  const normalOnly = !q && apex_store.filter_type === ApexFilterEnum.normal;
  const groups = splitConfigIntoGroups(ApexLaunchOptionsConfig as ApexConfigRow[]);
  const out: ApexConfigRow[] = [];

  for (const { categoryKey, items } of groups) {
    const typeFiltered = items.filter(
      (item) => !(normalOnly && item.hide_in_normal_filter)
    );
    let visibleItems: SteamLaunchOptionsImpl[];
    if (!q) {
      visibleItems = typeFiltered;
    } else if (bilingualSearchText(categoryKey).toLowerCase().includes(q)) {
      visibleItems = typeFiltered;
    } else {
      visibleItems = typeFiltered.filter((item) => matchesItemSearch(item, q));
    }
    if (visibleItems.length === 0) {
      continue;
    }
    out.push(categoryKey);
    out.push(...visibleItems);
  }
  return out;
});
</script>

<template>
  <div class="d-flex flex-column h-100 min-height-0">
    <ApexFilter/>
    <div ref="listWrapRef" class="flex-grow-1 min-height-0" :style="listWrapStyle">
    <v-list
      v-model:selected="apex_store.options_selection"
      select-strategy="leaf"
      class="rounded-0 apex-options-list h-100 min-height-0"
      style="overflow-y: auto"
    >
      <template v-for="item in displayedLaunchOptions">
        <template v-if="isSteamLaunchOptionsImpl(item)">
          <div class="apex-list-item-wrap" :title="t('apexLaunchOptions.ui.rightClickTip')">
          <v-list-item :value="item" @click="check_item(item)"
                       @contextmenu.prevent="apex_store.showTip(<SteamLaunchOptionsImpl>item)"
          >
            <!--中间的内容-->
            <template v-slot:default="{isSelected}"
                      style="align-content: center;text-align: center;">
              <v-expand-transition>
              <div v-if="isSelected" class="d-flex flex-row align-center w-100 selected_item_row launch-option-expand-body">
                <!--多参数-->
                <template v-if="item?.parameters && item.identifier && !item?.is_combination_parameters">
                  <v-btn-toggle
                    v-model:model-value="apex_store.settings_config[item.identifier]"
                    v-if="isSelected"
                    color="primary"
                    variant="text"
                    class="apex-parameter-toggle"
                    style="max-height: 25px"
                    border
                    divided>
                    <template v-if="item?.identifier === 'miles_language'">
                      <!--配音设置-->
                      <ApexLanguage/>
                      <br/>
                    </template>
                    <template v-else>
                      <!--item.parameters-->
                      <v-btn
                        v-for="pi in item.parameters"
                        :key="launchOptionKey(pi)"
                        size="small"
                        v-if="item.identifier && apex_store.settings_config[item.identifier]"
                        :title="(pi?.requirement_description && !checkRequirement(pi)) ? parameterTooltipText(pi) : undefined"
                        :color="pi.requirement ? ( checkRequirement(pi) ? 'info':'error') : 'info'"
                        :value="pi?.default_parameter || pi.parameter"
                        @click.stop="apex_store.settings_config[item.identifier] = pi?.default_parameter || pi.parameter"
                      >
                        {{ translateApexLaunchOptionText(pi.name) }}
                      </v-btn>
                      <template v-else>error apex_store.settings_config not find id</template>
                    </template>
                  </v-btn-toggle>
                  <template v-if="item?.identifier === 'miles_language'">
                    <v-spacer/>
                    <v-icon icon="mdi-information-variant"
                            @click.stop="open_miles_language_download_help"
                            @mousedown.stop=""
                            @mouseup.stop=""
                            @pointerdown.stop=""
                            :color="apex_store.download_language_button_color"
                            :class="{ 'warning-red-text-edge-animate': is_download_button_danger }"
                            :title="is_download_button_danger ? t('apexLaunchOptions.ui.voicePackRequired') : undefined"
                            variant="flat"
                    >
                    </v-icon>
                  </template>
                </template>

                <template v-if="item?.identifier=== 'forced_resolution'">
                  <!--强制分辨率-->
                  <div
                    style="max-height: 25px;  font-size: 11px;color: rgba(135,135,135,0.82)"
                    class="d-flex flex-row align-center">
                    <span class="input_inline_label">{{ t('apexLaunchOptions.ui.widthLabel') }}</span>
                    <ApexNumberInput v-model="apex_store.width"/>
                    <span/>
                    <span class="input_inline_label">{{ t('apexLaunchOptions.ui.heightLabel') }}</span>
                    <ApexNumberInput v-model="apex_store.height"/>
                  </div>
                  <v-spacer/>
                  <div
                    class="preset_tail"
                    @click.stop=""
                    @mousedown.stop=""
                    @mouseup.stop=""
                    @pointerdown.stop=""
                  >
                    <ApexForcedResolutionPreset/>
                  </div>
                </template>
                <template v-else-if="item?.identifier == 'fps'"
                          style="max-height: 25px;">
                  <!--fps-->
                  <div class="d-flex" style="flex: 1" v-if="apex_store.settings_config[item.identifier] === '-freq X +fps_max X'">
                    <ApexNumberInput v-model="apex_store.fps"/>
                    <v-spacer/>
                    <div
                      class="preset_tail"
                      @click.stop=""
                      @mousedown.stop=""
                      @mouseup.stop=""
                      @pointerdown.stop=""
                    >
                      <ApexFpsPreset/>
                    </div>
                  </div>
                </template>
                <template v-else-if="item?.identifier == 'lobby_max_fps'"
                          style="max-height: 25px;">
                  <!--大厅Fps-->
                  <ApexNumberInput v-model="apex_store.lobby_max_fps"/>
                  <v-spacer/>
                  <div
                    class="preset_tail"
                    @click.stop=""
                    @mousedown.stop=""
                    @mouseup.stop=""
                    @pointerdown.stop=""
                  >
                    <ApexLobbyFpsPreset/>
                  </div>
                </template>
                <template v-else-if="item?.identifier == 'letterbox_aspect'">
                  <!--比例-->
                  <div class="letterbox_aspect_inline">
                    <div class="letterbox_aspect_field">
                    <span
                      class="letterbox_aspect_label"
                      :title="t('apexLaunchOptions.ui.aspectGoalLabel')"
                    >
                      {{ t('apexLaunchOptions.ui.aspectGoalLabel') }}
                    </span>
                      <ApexNumberInput v-model="apex_store.mat_letterbox_aspect_goal" :step="0.1"/>
                    </div>
                    <div class="letterbox_aspect_field">
                    <span
                      class="letterbox_aspect_label"
                      :title="t('apexLaunchOptions.ui.aspectMinLabel')"
                    >
                      {{ t('apexLaunchOptions.ui.aspectMinLabel') }}
                    </span>
                      <ApexNumberInput v-model="apex_store.mat_letterbox_aspect_min" :step="0.1"/>
                    </div>
                    <div class="letterbox_aspect_field">
                    <span
                      class="letterbox_aspect_label"
                      :title="t('apexLaunchOptions.ui.aspectThresholdLabel')"
                    >
                      {{ t('apexLaunchOptions.ui.aspectThresholdLabel') }}
                    </span>
                      <ApexNumberInput v-model="apex_store.mat_letterbox_aspect_threshold" :step="0.1"/>
                    </div>
                  </div>
                  <v-spacer/>
                  <div
                    class="preset_tail"
                    @click.stop=""
                    @mousedown.stop=""
                    @mouseup.stop=""
                    @pointerdown.stop=""
                  >
                    <ApexAspectPreset/>
                  </div>
                </template>
              </div>
              </v-expand-transition>
            </template>

            <!--抬头-->
            <template v-slot:title>
              <div class="d-flex flex-row align-center">
                <p style="font-size: 15px"> {{ translateApexLaunchOptionText(item?.name) }} </p>
                <ApexListItemBadges :uncommon="!!item.hide_in_normal_filter"/>
                <v-chip
                  v-if="item.is_new && !settings_store.apexNewItemsSeen.includes(item.identifier ?? '')"
                  color="error"
                  size="x-small"
                  variant="flat"
                  class="ml-2 font-weight-bold px-1"
                  style="height: 16px; font-size: 10px;"
                >
                  NEW
                </v-chip>
                <v-spacer></v-spacer>
                <!--参数信息放在右上角的-->
                <p class="parameter_info">
                  <!--先看哈是不是大厅的参数,这个排前面-->
                  <template v-if="item.identifier === 'lobby_max_fps'">
                    +lobby_max_fps {{ apex_store.lobby_max_fps }}
                  </template>
                  <!--强制分辨率-->
                  <template v-else-if="item.identifier === 'forced_resolution'">
                    -width {{ apex_store.width }} -height {{ apex_store.height }}
                  </template>
                  <!--跳过开场动画-->
                  <template v-else-if="item.identifier === 'skip_intro_animation'">
                    -novid -dev
                  </template>
                  <!--比例-->
                  <template v-else-if="item?.identifier == 'letterbox_aspect'">
                    +mat_letterbox_aspect_min {{ apex_store.mat_letterbox_aspect_min }}
                    +mat_letterbox_aspect_goal {{ apex_store.mat_letterbox_aspect_goal }}
                    +mat_letterbox_aspect_threshold {{ apex_store.mat_letterbox_aspect_threshold }}
                  </template>
                  <!--fov_scale-->
                  <template v-else-if="item?.identifier == 'fov_scale'">
                    <template v-if="apex_store.active_apex_account?.kind === 'steam'">
                      +cl_fovScale "1.7"
                    </template>
                    <template v-else>
                      +cl_fovScale 1.7
                    </template>
                  </template>
                  <!--替换fps的X   应为 +fps_max X 或 +fps_max unlimited-->
                  <template v-else-if="item.identifier === 'fps'">
                    <template v-if="apex_store.settings_config[item.identifier] === '-freq X +fps_max X'">
                      -freq {{ String(apex_store.fps) }} +fps_max {{ String(apex_store.fps) }}
                    </template>
                    <template v-else>
                      {{ apex_store.settings_config[item.identifier] }}
                    </template>
                  </template>
                  <!--只有单个参数的时候直接显示输入的参数-->
                  <template v-else-if="item?.parameter">{{ item.default_parameter || item.parameter }}</template>
                  <!---->
                  <template v-else-if="item?.parameters && item?.identifier && item?.is_combination_parameters">
                    {{ item.parameters?.map((i) => i.parameter).join(' ') }}
                  </template>
                  <!--有多个参数的时候取看是那个值用来显示如 window,fps,miles_language -->
                  <template v-else-if="item?.parameters && item?.identifier">
                    {{ apex_store.settings_config[item?.identifier] }}
                  </template>
                </p>
              </div>
            </template>

            <!--前面的按钮-->
            <template v-slot:prepend="{ isSelected, select }">
              <v-list-item-action start>
                <v-checkbox-btn :model-value="isSelected" @update:modelValue="select"/>
              </v-list-item-action>
            </template>

            <!--子标题-->
            <template v-slot:subtitle>
              <p>{{ item?.description ? translateApexLaunchOptionText(item.description) : '' }}</p>
            </template>

          </v-list-item>
          </div>
          <v-divider inset></v-divider>
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
    </div>
  </div>
</template>

<style scoped>
.min-height-0 {
  min-height: 0;
}

.parameter_info {
  color: #757575;
  font-size: 14px;
}

.input_inline_label {
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.preset_tail {
  display: flex;
  justify-content: flex-end;
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
  margin-top: 0;
  padding-top: 0;
  padding-bottom: 0;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.apex-category-inner {
  width: 100%;
  display: flex;
  align-items: center;
  min-height: 30px;
  padding-top: 0;
  padding-bottom: 0;
}

.apex-category-text {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: rgba(var(--v-theme-on-surface), 0.75);
  white-space: nowrap;
}

.letterbox_aspect_inline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  font-size: 11px;
  color: rgba(135, 135, 135, 0.82);
}

.letterbox_aspect_field {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 0;
}

.letterbox_aspect_label {
  display: inline-block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected_item_row {
  min-width: 0;
  overflow: hidden;
}

.apex-parameter-toggle {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

:deep(.apex-parameter-toggle .v-btn-group) {
  max-width: 100%;
  min-width: 0;
  flex-wrap: wrap;
}

:deep(.apex-parameter-toggle .v-btn) {
  min-width: 0;
  max-width: 100%;
}
</style>
