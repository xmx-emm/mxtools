<script setup lang="ts">
const model = defineModel<boolean>({default: false});
</script>

<template>
  <v-dialog
    v-model="model"
    width="720"
    max-width="calc(100vw - 32px)"
    max-height="calc(100dvh - 32px)"
    content-class="game-tip-dialog"
  >
    <slot />
  </v-dialog>
</template>

<style>
.v-dialog > .game-tip-dialog {
  align-items: stretch;
  margin: 16px;
}

.v-dialog > .game-tip-dialog > .game-tip-card {
  overflow: hidden;
}

.game-tip-dialog .v-ripple__container {
  display: none !important;
}
</style>
