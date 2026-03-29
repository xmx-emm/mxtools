<script setup lang="ts">


import {computed, onMounted, watch} from "vue";
import ApexLaunchOptionsConfig from "@/data/apex_launch_options_config.ts";
import {isSteamLaunchOptionsImpl, SteamLaunchOptionsImpl} from "@/data/steam.ts";
import ApexLanguage from "@/components/game/apex/language/ApexLanguage.vue";
import ApexForcedResolutionPreset from "@/components/game/apex/preset/ApexForcedResolutionPreset.vue";
import ApexAspectPreset from "@/components/game/apex/preset/ApexAspectPreset.vue";
import ApexFpsPreset from "@/components/game/apex/preset/ApexFpsPreset.vue";
import ApexNumberInput from "@/components/game/apex/common/ApexNumberInput.vue";
import apexStore from "@/stores/game/apex.ts";
import { useSettingsStore } from "@/stores/settings.ts";

const apex_store = apexStore();
const settings_store = useSettingsStore();

/**
 * 检查前置条件
 */
function checkRequirement(item: SteamLaunchOptionsImpl): boolean {
  if (item?.requirement) {
    if (typeof item.requirement === "string") {
      return apex_store.launch_options.includes(item.requirement)
    } else if (typeof item.requirement === "object") {
      for (const r of item.requirement) {
        if (apex_store.launch_options.includes(r)) {
          return true;
        }
      }
    } else if (typeof item.requirement === "function") {
      return item.requirement()
    }
  }
  return false;
}


/**
 *检查是否显示fps的参数,显示的时候会替换成fps
 */
function check_number_show(item: SteamLaunchOptionsImpl, identifier: string): boolean {
  return item?.identifier && typeof apex_store.settings_config[item?.identifier] === 'string' &&
      apex_store.settings_config[item?.identifier].includes('X') && item?.identifier === identifier
}


const is_download_button_danger = computed(() => {
  const color = String(apex_store.download_language_button_color || "").toLowerCase();
  return color === "red" || color === "error";
});

onMounted(() => {
  apex_store.start_launch()
})
function check_item(item: SteamLaunchOptionsImpl){
  // 用户勾选 is_new 选项时，记录为已见过，下次启动不再显示 NEW
  if (item?.is_new && item?.identifier) {
    settings_store.markApexNewItemSeen(item.identifier);
  }
}
watch(
    () => apex_store.options_selection,
    () => {
      apex_store.update_download_language_button_color()
    },
    { deep: true }
);
</script>

<template>
  <v-list
      v-model:selected="apex_store.options_selection"
      select-strategy="leaf"
      class="rounded-0 apex-options-list"
      style="height: 100%;overflow-y: auto"
  >
    <template v-for="item in ApexLaunchOptionsConfig">
      <template v-if="isSteamLaunchOptionsImpl(item)">
        <v-list-item :value="item" @click="apex_store.update_download_language_button_color();check_item(item)"
                     v-tooltip="{text:'右键查看', location:'bottom', openDelay: '800'}"
                     @contextmenu.prevent="apex_store.showTip(<SteamLaunchOptionsImpl>item)"
        >
          <!--中间的内容-->
          <template v-slot:default="{isSelected}"
                    style="align-content: center;text-align: center;">
            <div class="d-flex flex-row align-center w-100" v-if="isSelected">
              <!--多参数-->
              <template v-if="item?.parameters && item.identifier && !item.is_combination_parameters">
                <v-btn-toggle
                    v-model:model-value="apex_store.settings_config[item.identifier]"
                    v-if="isSelected"
                    color="primary"
                    variant="text"
                    style="max-height: 25px"
                    border
                    divided>

                  <!--配音设置-->
                  <template v-if="item?.identifier === 'miles_language'">
                    <ApexLanguage/>
                    <br/>
                  </template>
                  <!--item.parameters-->
                  <template v-else>
                    <v-tooltip v-slot:activator="{props}"
                               v-for="pi in item.parameters"
                               :text="pi?.requirement_description || pi?.description || pi?.identifier"
                               :disabled="!(pi?.requirement_description && !checkRequirement(pi))"
                    >
                      <v-btn
                          size="small"
                          v-bind="props"
                          v-if="item.identifier && apex_store.settings_config[item.identifier]"
                          :color="pi.requirement ? ( checkRequirement(pi) ? 'info':'error') : 'info'"
                          :value="pi?.default_parameter || pi.parameter"
                          @click.stop="apex_store.settings_config[item.identifier] = pi?.default_parameter || pi.parameter"
                      >
                        {{ pi.name }}
                      </v-btn>
                    </v-tooltip>
                  </template>
                </v-btn-toggle>
                <template v-if="item?.identifier === 'miles_language'">
                  <v-spacer/>
                    <v-icon icon="mdi-information-variant"
                            @click.stop="apex_store.download_miles_language_semi_automatic_dialog=true"
                            @mousedown.stop=""
                            @mouseup.stop=""
                            @pointerdown.stop=""
                            :color="apex_store.download_language_button_color"
                            :class="{ 'warning-red-text-edge-animate': is_download_button_danger }"
                            v-tooltip="{ text: '需要应用语音包', location: 'bottom', openDelay: '200', disabled: !is_download_button_danger }"
                            variant="flat"
                    >
                    </v-icon>
                </template>
              </template>

              <!--强制分辨率-->
              <template v-if="item?.identifier=== 'forced_resolution'">
                <span class="input_inline_label">宽:</span>
                <ApexNumberInput v-model="apex_store.width"/>
                <span/>
                <span class="input_inline_label">高:</span>
                <ApexNumberInput v-model="apex_store.height"/>
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
              <!--大厅Fps-->
              <template v-if="item?.identifier == 'lobby_max_fps'"
                        style="max-height: 25px;">
                <ApexNumberInput v-model="apex_store.lobby_max_fps"/>
              </template>
              <!--比例-->
              <template v-if="item?.identifier == 'mat_letterbox_aspect_min'"
                        style="max-height: 25px;">
                <ApexNumberInput v-model="apex_store.mat_letterbox_aspect_min" :step="0.1"/>
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
              <!--fps-->
              <template v-if="check_number_show(item,'fps')"
                        style="max-height: 25px;">
                <div class="d-flex" style="flex: 1">
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
            </div>
          </template>

          <!--抬头-->
          <template v-slot:title>
            <div class="d-flex flex-row align-center">
              <p style="font-size: 15px"> {{ item?.name }} </p>
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
                <!--比例-->
                <template v-else-if="item?.identifier == 'mat_letterbox_aspect_min'">
                  +mat_letterbox_aspect_min {{ apex_store.mat_letterbox_aspect_min }}
                </template>
                <!--替换fps的X   应为 +fps_max X 或 +fps_max unlimited-->
                <template v-else-if="item.identifier === 'fps' ">
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
                  {{ item.parameters?.map((i) => i.parameter).join(" ") }}
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
              <v-progress-circular :size="20" style="margin: 0 0" v-if="apex_store.is_start_loading"
                                   transition="scroll-x-transition"
                                   indeterminate/>
              <v-checkbox-btn v-else :model-value="isSelected" @update:modelValue="select"/>
            </v-list-item-action>
          </template>

          <!--子标题-->
          <template v-slot:subtitle>
            <p>{{ item?.description }}</p>
          </template>

        </v-list-item>
        <v-divider inset></v-divider>
      </template>
      <template v-else>
        <v-list-subheader class="apex-category px-4">
          <div class="apex-category-inner">
            <span class="apex-category-text">{{ item }}</span>
          </div>
        </v-list-subheader>
      </template>
    </template>
  </v-list>
</template>

<style scoped>
.parameter_info {
  color: #757575;
  font-size: 14px;
}

.input_inline_label {
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.preset_tail {
  min-width: 112px;
  display: flex;
  justify-content: flex-end;
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
</style>