<script setup lang="ts">
import {computed} from "vue";
import apexStore from "@/stores/game/apex.ts";

interface ResolutionPreset {
  title: string
  width: number
  height: number
  value: string
}

const apex_store = apexStore();

const common_resolutions: ResolutionPreset[] = [
  {title: "1280 x 720 (720P)", width: 1280, height: 720, value: "1280x720"},
  {title: "1920 x 1080 (1K)", width: 1920, height: 1080, value: "1920x1080"},
  {title: "2560 x 1440 (2K)", width: 2560, height: 1440, value: "2560x1440"},
  {title: "3440 x 1440 (2K 超宽)", width: 3440, height: 1440, value: "3440x1440"},
]

const all_resolutions: ResolutionPreset[] = [
  ...common_resolutions,
  {title: "1600 x 900 (900P)", width: 1600, height: 900, value: "1600x900"},
  {title: "1680 x 1050 (1050P)", width: 1680, height: 1050, value: "1680x1050"},
  {title: "2560 x 1080 (2K 超宽)", width: 2560, height: 1080, value: "2560x1080"},
  {title: "3840 x 2160 (4K)", width: 3840, height: 2160, value: "3840x2160"},
]

const sorted_resolutions = computed(() => {
  return [...all_resolutions].sort((a, b) => {
    if (a.width !== b.width) {
      return a.width - b.width;
    }
    return a.height - b.height;
  });
});

function apply_resolution(item: ResolutionPreset) {
  apex_store.width = item.width;
  apex_store.height = item.height;
}

const selected_resolution_title = computed(() => {
  const current_value = `${apex_store.width}x${apex_store.height}`;
  const target = sorted_resolutions.value.find((item) => item.value === current_value);
  return target?.title ?? "分辨率预设";
});
</script>

<template>
  <v-menu closeOnBack :open-on-click="false" openOnHover openDelay="150" closeDelay="100">
    <template v-slot:activator="{ props }">
      <div class="preset_hover_box" v-bind="props">
        <span class="preset_hover_text">{{ selected_resolution_title }}</span>
      </div>
    </template>
    <v-list>
      <v-list-item
          v-for="item in sorted_resolutions"
          :key="item.value"
          :title="item.title"
          :active="item.width === apex_store.width && item.height === apex_store.height"
          @click="apply_resolution(item)"
      />
    </v-list>
  </v-menu>
</template>

<style scoped>
.preset_hover_box {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 172px;
  height: 20px;
  padding: 0 6px;
  cursor: pointer;
}

.preset_hover_text {
  display: inline-block;
  width: 100%;
  text-align: right;
  white-space: nowrap;
  font-size: 11px;
}
</style>
