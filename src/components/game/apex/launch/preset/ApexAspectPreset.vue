<script setup lang="ts">
import AspectPreset from '@/components/game/common/AspectPreset.vue';
import {useApexStore} from '@/stores/game/apex.ts';
import {
  ASPECT_LETTERBOX_MIN_DEFAULT,
} from '@/data/presets/apex_quick_preset.ts';

const apex_store = useApexStore();

function apply_aspect(value: number) {
  apex_store.mat_letterbox_aspect_min = ASPECT_LETTERBOX_MIN_DEFAULT;
  apex_store.mat_letterbox_aspect_goal = value;
}
</script>

<template>
  <AspectPreset
    :min="apex_store.mat_letterbox_aspect_min"
    :goal="apex_store.mat_letterbox_aspect_goal"
    @apply="apply_aspect"
  />
</template>
