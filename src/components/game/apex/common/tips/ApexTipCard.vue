<script setup lang="ts">
import {useApexStore} from '@/stores/game/apex.ts';

defineProps<{
  title?: string
  subtitle?: string
}>();

const apex_store = useApexStore();
</script>

<template>
  <v-card :title="title" :subtitle="subtitle" min-width="200px" class="apex-tip-card">
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
    <div class="apex-tip-scroll-region">
      <v-card-text v-if="$slots.text">
        <slot name="text" />
      </v-card-text>
      <div class="mx-6 mb-6 tip-body">
        <slot/>
      </div>
    </div>
  </v-card>
</template>
<style scoped>
.apex-tip-card {
  display: flex;
  max-height: calc(100dvh - 32px);
  flex-direction: column;
  overflow: hidden;
}

:deep(.apex-tip-card > .v-card-item) {
  z-index: 1;
  flex: 0 0 auto;
  background: rgb(var(--v-theme-surface));
}

.apex-tip-scroll-region {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

:deep(.v-card-subtitle) {
  white-space: pre-line;
}

.tip-body :deep(p) {
  white-space: pre-line;
}
</style>
