<script setup lang="ts">

import FpsPreset from '@/components/game/common/FPSPreset.vue';
import apexStore from '@/stores/game/apex.ts';

const apex_store = apexStore();
</script>

<template>
  <FpsPreset v-model="apex_store.lobby_max_fps" unit-label="FPS"/>
</template>

<style scoped>

</style>
