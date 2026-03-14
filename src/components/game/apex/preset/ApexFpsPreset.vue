<script setup lang="ts">
import {computed} from "vue";
import apexStore from "@/stores/game/apex.ts";

const apex_store = apexStore();

const fps_presets = [60, 90, 120, 144, 165, 240, 300];

const sorted_fps_presets = computed(() => {
  return [...fps_presets].sort((a, b) => a - b);
});

function apply_fps(value: number) {
  apex_store.fps = value;
}

const selected_fps_title = computed(() => {
  return `${apex_store.fps} FPS`;
});
</script>

<template>
  <v-menu closeOnBack :open-on-click="false" openOnHover openDelay="150" closeDelay="100">
    <template v-slot:activator="{ props }">
      <div class="preset_hover_box" v-bind="props">
        <span class="preset_hover_text">{{ selected_fps_title }}</span>
      </div>
    </template>
    <v-list>
      <v-list-item
          v-for="item in sorted_fps_presets"
          :key="item"
          :title="`${item} FPS`"
          :active="item === apex_store.fps"
          @click="apply_fps(item)"
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
