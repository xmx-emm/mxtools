<script setup lang="ts">
import {onMounted} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import {openPath} from '@tauri-apps/plugin-opener';
import {useToast} from 'vue-toastification';
import PubgLaunchOptionsConfig from '@/data/pubg_launch_options_config.ts';
import {isSteamLaunchOptionsImpl, SteamLaunchOptionsImpl} from '@/data/steam.ts';
import pubgStore from '@/stores/game/pubg.ts';
import PubgNumberInput from '@/components/game/pubg/common/PubgNumberInput.vue';
import ResolutionPreset from '@/components/game/common/ResolutionPreset.vue';
import FpsPreset from '@/components/game/common/FPSPreset.vue';

const pubg_store = pubgStore();
const toast = useToast();

onMounted(() => {
  pubg_store.start_launch();
});

function graphicsPreviewTokens(item: SteamLaunchOptionsImpl): string {
  const mode = String(pubg_store.settings_config.graphics_api || 'dx11');
  const sub = item.parameters?.find((p) => p.identifier === mode);
  if (!sub) return '';
  const par = sub.parameter;
  if (Array.isArray(par)) return par.join(' ');
  return typeof par === 'string' ? par : '';
}

function getParameterPreview(item: SteamLaunchOptionsImpl): string {
  if (item.identifier === 'max_mem' || item.parameter === '-maxMem=X') {
    return `-maxMem=${pubg_store.max_mem}`;
  }
  if (item.identifier === 'refresh_rate' || item.parameter === '-refresh X') {
    return `-refresh ${pubg_store.refresh_rate}`;
  }
  if (item.identifier === 'forced_resolution' || item.parameter === '-res W H') {
    return `-res ${pubg_store.res_width} ${pubg_store.res_height}`;
  }
  if (
    item.identifier === 'view_distance_scale' ||
    item.parameter === '+r.ViewDistanceScale=X'
  ) {
    return `+r.ViewDistanceScale=${pubg_store.view_distance_scale}`;
  }
  if (item.identifier === 'window') {
    return String(pubg_store.settings_config.window || '');
  }
  if (item.identifier === 'graphics_api' && item.parameters) {
    return graphicsPreviewTokens(item);
  }
  if (typeof item.parameter === 'string') return item.parameter;
  if (Array.isArray(item.parameter)) {
    const key = item.identifier ?? item.name;
    const override = (pubg_store.parameter_overrides as Record<string, string[]>)?.[key];
    if (override && override.length > 0) return override.join(' ');
    if (typeof item.default_parameter === 'string') return item.default_parameter;
    return item.parameter.join(' ');
  }
  return item.description || '';
}

function windowModeBtnValue(p: SteamLaunchOptionsImpl): string {
  const par = p.parameter;
  if (typeof par === 'string') return par;
  if (Array.isArray(par) && par.length > 0 && typeof par[0] === 'string') return par[0];
  return '';
}

async function openPubgLogsFolder() {
  try {
    const path = await invoke<string>('get_pubg_logs_folder_path');
    await openPath(path);
  } catch (e) {
    toast.error(String(e));
  }
}

async function toggleSkipIntroMovies() {
  try {
    await pubg_store.set_skip_intro_movies_disabled(!pubg_store.skip_intro_movies_disabled);
  } catch (e) {
    toast.error(String(e));
  }
}

function onSkipIntroItemClick(e: Event) {
  e.stopPropagation();
  // 不阻塞 UI，实际 await 在 toggleSkipIntroMovies 内部处理异常
  void toggleSkipIntroMovies();
}
</script>

<template>
  <v-list
    v-model:selected="pubg_store.options_selection"
    select-strategy="leaf"
    class="rounded-0 pubg-options-list"
    style="height: 100%;overflow-y: auto"
  >
    <template v-for="raw in PubgLaunchOptionsConfig" :key="typeof raw === 'string' ? raw : raw.name">
      <template v-if="isSteamLaunchOptionsImpl(raw)">
        <v-list-item
          :value="raw"
          @click="raw.identifier === 'skip_intro' ? onSkipIntroItemClick($event) : undefined"
        >
          <template #default="{isSelected}">
            <div v-if="isSelected" class="d-flex flex-row align-center w-100 flex-wrap gap-1">
              <template v-if="raw.identifier === 'window' && raw.parameters">
                <v-btn-toggle
                  v-model="pubg_store.settings_config.window"
                  color="primary"
                  variant="text"
                  style="max-height: 25px"
                  border
                  divided
                  @click.stop=""
                  @mousedown.stop=""
                >
                  <v-btn
                    v-for="p in raw.parameters"
                    :key="p.name"
                    size="small"
                    :value="windowModeBtnValue(p)"
                  >
                    {{ p.name }}
                  </v-btn>
                </v-btn-toggle>
              </template>

              <template v-else-if="raw.identifier === 'graphics_api' && raw.parameters">
                <v-btn-toggle
                  v-model="pubg_store.settings_config.graphics_api"
                  color="primary"
                  variant="text"
                  style="max-height: 25px"
                  border
                  divided
                  @click.stop=""
                  @mousedown.stop=""
                >
                  <v-btn
                    v-for="p in raw.parameters"
                    :key="p.identifier ?? p.name"
                    size="small"
                    :value="p.identifier"
                  >
                    {{ p.name }}
                  </v-btn>
                </v-btn-toggle>
              </template>

              <template v-else-if="raw.identifier === 'max_mem' || raw.parameter === '-maxMem=X'">
                <span class="input_inline_label">最大内存</span>
                <PubgNumberInput v-model="pubg_store.max_mem" />
              </template>

              <template v-else-if="raw.identifier === 'refresh_rate' || raw.parameter === '-refresh X'">
                <div class="d-flex align-center flex-grow-1" style="min-width: 0">
                  <span class="input_inline_label">刷新率</span>
                  <PubgNumberInput v-model="pubg_store.refresh_rate" />
                </div>
                <div class="preset_tail">
                  <FpsPreset
                    v-model="pubg_store.refresh_rate"
                    unit-label="Hz"
                  />
                </div>
              </template>

              <template
                v-else-if="raw.identifier === 'forced_resolution' || raw.parameter === '-res W H'"
              >
                <div class="d-flex align-center flex-grow-1" style="min-width: 0">
                  <span class="input_inline_label">宽</span>
                  <PubgNumberInput v-model="pubg_store.res_width" />
                  <span class="input_inline_label">高</span>
                  <PubgNumberInput v-model="pubg_store.res_height" />
                </div>
                <div class="preset_tail">
                  <ResolutionPreset
                    :width="pubg_store.res_width"
                    :height="pubg_store.res_height"
                    @update:width="pubg_store.res_width = $event"
                    @update:height="pubg_store.res_height = $event"
                  />
                </div>
              </template>

              <template
                v-else-if="
                  raw.identifier === 'view_distance_scale' ||
                    raw.parameter === '+r.ViewDistanceScale=X'
                "
              >
                <span class="input_inline_label">视距比例</span>
                <PubgNumberInput
                  v-model="pubg_store.view_distance_scale"
                  :step="0.1"
                  :min="0.5"
                  :max="1"
                />
              </template>
            </div>
          </template>

          <template #title>
            <div class="d-flex flex-row align-center w-100 min-width-0">
              <p class="pubg-title-text">{{ raw?.name }}</p>
              <v-spacer />
              <p class="parameter_info text-truncate">{{ getParameterPreview(raw) }}</p>
            </div>
          </template>

          <template #subtitle>
            <div
              v-if="raw.identifier === 'verbose_log'"
              class="d-flex flex-row align-center w-100 min-width-0 pubg-subtitle-row"
            >
              <p class="pubg-subtitle-text flex-grow-1 text-truncate">{{ raw?.description }}</p>
              <v-btn
                icon
                variant="text"
                size="small"
                density="compact"
                class="flex-shrink-0"
                title="打开日志目录"
                @click.stop="openPubgLogsFolder"
              >
                <v-icon size="20">mdi-folder-outline</v-icon>
              </v-btn>
            </div>
            <p v-else>{{ raw?.description ? raw.description : '' }}</p>
          </template>

          <template #prepend="{ isSelected, select }">
            <v-list-item-action start>
              <template v-if="raw.identifier === 'skip_intro'">
                <v-progress-circular
                  v-if="pubg_store.is_start_loading || pubg_store.is_skip_intro_movies_loading"
                  :size="20"
                  style="margin: 0 0"
                  transition="scroll-x-transition"
                  indeterminate
                />
                <v-btn
                  v-else
                  :color="pubg_store.skip_intro_movies_disabled ? 'error' : 'primary'"
                  variant="flat"
                  size="small"
                  icon
                  :title="pubg_store.skip_intro_movies_disabled ? '恢复开场动画（重命名 Movies_disabled -> Movies）' : '禁用开场动画（重命名 Movies -> Movies_disabled）'"
                  @click.stop="toggleSkipIntroMovies"
                >
                  <v-icon size="20">
                    {{ pubg_store.skip_intro_movies_disabled ? 'mdi-restore' : 'mdi-folder-remove-outline' }}
                  </v-icon>
                </v-btn>
              </template>

              <template v-else>
                <v-progress-circular
                  v-if="pubg_store.is_start_loading"
                  :size="20"
                  style="margin: 0 0"
                  transition="scroll-x-transition"
                  indeterminate
                />
                <v-checkbox-btn v-else :model-value="isSelected" @update:model-value="select" />
              </template>
            </v-list-item-action>
          </template>
        </v-list-item>
        <v-divider inset />
      </template>
      <template v-else>
        <v-list-subheader class="pubg-category px-4">
          <div class="pubg-category-inner">
            <span class="pubg-category-text">{{ raw }}</span>
          </div>
        </v-list-subheader>
      </template>
    </template>
  </v-list>
</template>

<style scoped>
.pubg-title-text {
  font-size: 15px;
  margin: 0;
  flex-shrink: 0;
}

.pubg-subtitle-row {
  margin: 0;
}

.pubg-subtitle-text {
  font-size: 13px;
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.parameter_info {
  color: #757575;
  font-size: 14px;
  max-width: 42%;
  margin: 0;
}

.input_inline_label {
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  margin-right: 4px;
  margin-left: 4px;
  flex-shrink: 0;
}

.pubg-options-list {
  padding: 0;
}

.preset_tail {
  min-width: 112px;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.pubg-category {
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

.pubg-category-inner {
  width: 100%;
  display: flex;
  align-items: center;
  min-height: 30px;
}

.pubg-category-text {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: rgba(var(--v-theme-on-surface), 0.75);
  white-space: nowrap;
}
</style>
