<script setup lang="ts">
import AspectPreset from '@/components/game/common/AspectPreset.vue';
import {useApexStore} from '@/stores/game/apex.ts';
import {
  ASPECT_LETTERBOX_MIN_DEFAULT,
  ASPECT_LETTERBOX_THRESHOLD,
} from '@/data/presets/apex_quick_preset.ts';

const apex_store = useApexStore();

function apply_aspect(value: number) {
  apex_store.mat_letterbox_aspect_min = ASPECT_LETTERBOX_MIN_DEFAULT;
  apex_store.mat_letterbox_aspect_goal = value;
  apex_store.mat_letterbox_aspect_threshold = ASPECT_LETTERBOX_THRESHOLD;
}
</script>

<template>
  <AspectPreset
    :min="apex_store.mat_letterbox_aspect_min"
    :goal="apex_store.mat_letterbox_aspect_goal"
    @apply="apply_aspect"
  />
</template>
