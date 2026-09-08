<script setup lang="ts">
import {usePubgStore} from '@/stores/game/pubg.ts';
import GameTipCard from '@/components/game/common/GameTipCard.vue';

defineProps<{
  title?: string
  subtitle?: string
}>();

const pubg_store = usePubgStore();
</script>

<template>
  <GameTipCard :title="title" :subtitle="subtitle" @close="pubg_store.closeTip()">
    <template v-if="$slots.text" #text>
      <slot name="text" />
    </template>
    <slot />
  </GameTipCard>
</template>
