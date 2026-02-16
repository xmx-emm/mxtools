<script setup lang="ts">


import {onMounted} from "vue";
import ApexLaunchOptionsConfig from "@/data/apex_launch_options_config.ts";
import {SteamLaunchOptionsImpl} from "@/data/steam.ts";
import ApexLanguage from "@/components/game/apex/ApexLanguage.vue";
import ApexLanguageDownload from "@/components/game/apex/ApexLanguageDownload.vue";
import {apexStore} from "@/stores/game/apex.ts";

const apex_store = apexStore();

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
    }
  }
  return false;
}

onMounted(() => {
  apex_store.start_launch()
})
</script>

<template>
  <v-list
      v-model:selected="apex_store.options_selection"
      select-strategy="leaf"
      style="height: 100%;overflow-y: scroll"
  >
    <template v-for="item in ApexLaunchOptionsConfig">
      <v-list-item :value="item" @click="apex_store.update_download_language_button_color"
                   v-tooltip="{text:'右键查看', location:'bottom', openDelay: '800'}"
                   @contextmenu.prevent="apex_store.showTip(item)"
      >
        <!--多参数选择-->
        <template v-slot:default="{isSelected}" v-if="item?.parameters && item.identifier"
                  style="align-content: center;text-align: center;">
          <v-btn-toggle
              v-model:model-value="apex_store.settings_config[item.identifier]"
              v-if="isSelected"
              color="primary"
              variant="text"
              style="max-height: 25px"
              border
              divided
          >
            <template v-if="item?.identifier === 'miles_language'"><!--配音设置-->
              <ApexLanguage/>
            </template>
            <template v-else>
              <v-tooltip v-slot:activator="{props}"
                         v-for="pi in item.parameters"
                         :text="pi?.requirement_description || pi?.identifier"
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
          <template
              v-if="isSelected && item?.identifier && typeof apex_store.settings_config[item?.identifier] === 'string' && apex_store.settings_config[item?.identifier].includes('X')"
              style="max-height: 25px;">
            <input type="number" style="width: 100px;padding: 0 20px;box-shadow:none" v-model="apex_store.fps"
                   @click.stop=""/>
          </template>
        </template>

        <template v-slot:title>
          <div class="d-flex flex-row align-items-center">
            <p style="font-size: 15px"> {{ item.name }} </p>
            <v-spacer></v-spacer>
            <p class="parameter_info">
              <template v-if="item?.parameter">{{ item.default_parameter || item.parameter }}</template>
              <template v-else-if="item?.parameters && item.identifier === 'fps'">
                {{ String(apex_store.settings_config[item.identifier]).replace("X", String(apex_store.fps)) }}
              </template>
              <template v-else-if="item?.parameters && item?.identifier">
                {{ apex_store.settings_config[item?.identifier] }}
              </template>
            </p>
          </div>
        </template>

        <template v-slot:prepend="{ isSelected, select }">
          <v-list-item-action start>
            <v-progress-circular :size="20" style="margin: 0 0" v-if="apex_store.is_start_loading"
                                 transition="scroll-x-transition"
                                 indeterminate/>
            <v-checkbox-btn v-else :model-value="isSelected" @update:modelValue="select"/>
          </v-list-item-action>
        </template>

        <template v-slot:subtitle>
          <p>{{ item.description }}</p>
        </template>

        <template v-slot:append>
          <ApexLanguageDownload v-if="item.identifier === 'miles_language'"/>
        </template>
      </v-list-item>
      <v-divider inset></v-divider>
    </template>
  </v-list>
</template>

<style scoped>
.parameter_info {
  color: #757575;
  font-size: 14px;
}
</style>