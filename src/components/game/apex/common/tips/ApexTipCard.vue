<script setup lang="ts">
import {useApexStore} from '@/stores/game/apex.ts';
import GameTipCard from '@/components/game/common/GameTipCard.vue';

defineProps<{
  title?: string
  subtitle?: string
}>();

const apex_store = useApexStore();
</script>

<template>
  <GameTipCard :title="title" :subtitle="subtitle" @close="apex_store.closeTip()">
    <template v-if="$slots.text" #text>
      <slot name="text" />
    </template>
    <slot />
  </GameTipCard>
</template>
