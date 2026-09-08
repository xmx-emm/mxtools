<script setup lang="ts">
import {useI18n} from 'vue-i18n';

defineProps<{
  title?: string;
  subtitle?: string;
}>();
defineEmits<{close: []}>();

const {t} = useI18n();
</script>

<template>
  <v-card class="game-tip-card">
    <v-card-item :title="title" class="game-tip-header">
      <template #append>
        <v-btn
          icon="mdi-close"
          variant="text"
          density="compact"
          size="small"
          class="game-tip-close text-medium-emphasis"
          :aria-label="t('common.close')"
          @click.stop="$emit('close')"
        />
      </template>
    </v-card-item>
    <div class="game-tip-scroll-region">
      <p v-if="subtitle" class="game-tip-subtitle text-medium-emphasis">{{ subtitle }}</p>
      <div v-if="$slots.text" class="game-tip-text">
        <slot name="text" />
      </div>
      <div v-if="$slots.default" class="game-tip-body">
        <slot />
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.game-tip-card {
  display: flex;
  width: 100%;
  min-width: 0;
  max-height: calc(100dvh - 32px);
  flex-direction: column;
  overflow: hidden;
}

.game-tip-card.v-card > .game-tip-header.v-card-item {
  flex: 0 0 auto;
  align-items: start;
  padding: 16px 24px 12px;
}

:deep(.v-card-item__content) {
  min-width: 0;
}

:deep(.v-card-title) {
  white-space: normal;
  overflow-wrap: anywhere;
}

.game-tip-close {
  width: var(--app-control-height-action);
  min-width: var(--app-control-height-action);
  height: var(--app-control-height-action);
}

.game-tip-scroll-region {
  min-height: 0;
  padding: 0 24px 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.6;
}

.game-tip-subtitle,
.game-tip-text {
  margin-bottom: 16px;
}

.game-tip-subtitle,
.game-tip-scroll-region :deep(p) {
  white-space: pre-line;
}

.game-tip-body :deep(img) {
  max-width: 100%;
}

.game-tip-scroll-region :deep(.game-tip-actions) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.game-tip-scroll-region :deep(.game-tip-actions .v-btn),
.game-tip-scroll-region :deep(.game-tip-link.v-btn) {
  max-width: 100%;
  height: auto;
  min-height: var(--app-control-height-action);
  padding-block: 6px;
}

.game-tip-scroll-region :deep(.game-tip-actions .v-btn__content),
.game-tip-scroll-region :deep(.game-tip-link .v-btn__content) {
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}

@media (max-width: 480px) {
  .game-tip-card.v-card > .game-tip-header.v-card-item {
    padding-inline: 16px;
  }

  .game-tip-scroll-region {
    padding: 0 16px 16px;
  }
}
</style>
