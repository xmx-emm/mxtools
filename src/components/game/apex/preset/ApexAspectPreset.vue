<script setup lang="ts">
import {computed} from "vue";
import apexStore from "@/stores/game/apex.ts";

interface AspectPreset {
  title: string
  value: number
}

const apex_store = apexStore();

const common_aspects: AspectPreset[] = [
  {title: "4:3 (1.33)", value: 1.3333},
  {title: "16:9 (1.78)", value: 1.7778},
  {title: "21:9 (2.33)", value: 2.3333},
]

const all_aspects: AspectPreset[] = [
  ...common_aspects,
  {title: "5:4 (1.25)", value: 1.25},
  {title: "16:10 (1.60)", value: 1.6},
  {title: "3:2 (1.50)", value: 1.5},
  {title: "32:9 (3.56)", value: 3.5556},
]

const sorted_aspects = computed(() => {
  return [...all_aspects].sort((a, b) => a.value - b.value);
});

function apply_aspect(value: number) {
  apex_store.mat_letterbox_aspect_min = value;
}

const selected_aspect_title = computed(() => {
  const target = sorted_aspects.value.find((item) => item.value === apex_store.mat_letterbox_aspect_min);
  return target?.title ?? "比例预设";
});
</script>

<template>
  <v-menu closeOnBack :open-on-click="false" openOnHover openDelay="150" closeDelay="100">
    <template v-slot:activator="{ props }">
      <div class="preset_hover_box" v-bind="props">
        <span class="preset_hover_text">{{ selected_aspect_title }}</span>
      </div>
    </template>
    <v-list>
      <v-list-item
          v-for="item in sorted_aspects"
          :key="item.title"
          :title="item.title"
          :active="item.value === apex_store.mat_letterbox_aspect_min"
          @click="apply_aspect(item.value)"
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
