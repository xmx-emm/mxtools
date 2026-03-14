<script setup lang="ts">
import apexStore from "@/stores/game/apex.ts";

defineProps<{
  title?: string
  subtitle?: string
}>()

const apex_store = apexStore();
</script>

<template>
  <v-card :title="title" :subtitle="subtitle">
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
    <template v-if="$slots.text" v-slot:text>
      <slot name="text"/>
    </template>
    <slot/>
  </v-card>
</template>

<style scoped>

</style>
