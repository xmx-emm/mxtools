<script setup lang="ts">
import ResolutionPreset from '@/components/game/common/ResolutionPreset.vue';
import {useApexStore} from '@/stores/game/apex.ts';

const apex_store = useApexStore();
</script>

<template>
  <ResolutionPreset
    :width="apex_store.width"
    :height="apex_store.height"
    @update:width="apex_store.width = $event"
    @update:height="apex_store.height = $event"
  />
</template>
