<script setup lang="ts">
import apexStore from '@/stores/game/apex.ts';

defineProps<{
  title?: string
  subtitle?: string
}>();

const apex_store = apexStore();
</script>

<template>
  <v-card :title="title" :subtitle="subtitle" min-width="200px">
    <template v-slot:append>
      <v-btn
        icon="mdi-close"
        variant="text"
        density="compact"
        size="small"
        class="text-medium-emphasis"
        @click.stop="apex_store.closeTip()"
      />
    </template>
    <template v-if="$slots.text" v-slot:text style="padding:0">
        <slot name="text" />
    </template>
    <div class="mx-6 mb-6 tip-body">
      <slot/>
    </div>
  </v-card>
</template>
<style scoped>
:deep(.v-card-subtitle) {
  white-space: pre-line;
}

.tip-body :deep(p) {
  white-space: pre-line;
}
</style>
