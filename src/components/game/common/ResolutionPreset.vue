<script setup lang="ts">
import {computed} from 'vue';
import type {ResolutionPreset} from '@/types/game.ts';
import {
  all_resolution_presets,
  sort_resolution_presets,
} from '@/data/presets/game_resolution_presets.ts';

const props = defineProps<{
  width: number;
  height: number;
}>();

const emit = defineEmits<{
  'update:width': [v: number];
  'update:height': [v: number];
}>();

const sorted_resolutions = computed(() => sort_resolution_presets(all_resolution_presets));

function apply_resolution(item: ResolutionPreset) {
  emit('update:width', item.width);
  emit('update:height', item.height);
}

const selected_resolution_title = computed(() => {
  const current_value = `${props.width}x${props.height}`;
  const target = sorted_resolutions.value.find((i) => i.value === current_value);
  return target?.title ?? '分辨率预设';
});
</script>

<template>
  <v-menu
    closeOnBack
    :open-on-click="false"
    openOnHover
    openDelay="150"
    closeDelay="100"
    content-class="compact-menu preset-compact-menu"
  >
    <template v-slot:activator="{ props: menuProps }">
      <div class="preset_hover_box" v-bind="menuProps">
        <span class="preset_hover_text">{{ selected_resolution_title }}</span>
      </div>
    </template>
    <v-list>
      <v-list-item
        v-for="item in sorted_resolutions"
        :key="item.value"
        :title="item.title"
        :active="item.width === width && item.height === height"
        @click="apply_resolution(item)"
      />
    </v-list>
  </v-menu>
</template>
