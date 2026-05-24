<script setup lang="ts">
import pubgStore from '@/stores/game/pubg.ts';

defineProps<{
  title?: string
  subtitle?: string
}>();

const pubg_store = pubgStore();
</script>

<template>
  <v-card :title="title" :subtitle="subtitle" min-width="200px">
    <template #append>
      <v-btn
        icon="mdi-close"
        variant="text"
        density="compact"
        size="small"
        class="text-medium-emphasis"
        @click.stop="pubg_store.closeTip()"
      />
    </template>
    <template v-if="$slots.text" #text style="padding: 0">
      <slot name="text" />
    </template>
    <div class="mx-6 mb-6">
      <slot />
    </div>
  </v-card>
</template>
