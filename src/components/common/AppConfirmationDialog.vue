<script setup lang="ts">
import {computed, onBeforeUnmount} from 'vue';
import {useI18n} from 'vue-i18n';
import {
  appConfirmationState,
  resolveAppConfirmation,
  runAppConfirmationAction,
  type AppConfirmationKind,
} from '@/utils/app_confirmation.ts';

const {t} = useI18n();

const iconByKind: Record<AppConfirmationKind, string> = {
  info: 'mdi-information-outline',
  warning: 'mdi-alert-outline',
  error: 'mdi-alert-circle',
};

const icon = computed(() => iconByKind[appConfirmationState.kind]);
const confirmColor = computed(() => appConfirmationState.kind === 'error' ? 'error' : 'primary');

onBeforeUnmount(() => resolveAppConfirmation(false));
</script>

<template>
  <v-dialog :model-value="appConfirmationState.open" max-width="520" persistent>
    <v-card class="app-confirmation-dialog">
      <v-card-title class="app-confirmation-dialog__title">
        <span
          class="app-confirmation-dialog__icon"
          :data-kind="appConfirmationState.kind"
        >
          <v-icon :icon="icon" size="20"/>
        </span>
        <span>{{ appConfirmationState.title }}</span>
      </v-card-title>

      <v-card-text class="app-confirmation-dialog__message">
        {{ appConfirmationState.message }}
      </v-card-text>

      <v-card-actions class="app-confirmation-dialog__actions">
        <v-spacer/>
        <v-btn variant="text" @click="resolveAppConfirmation(false)">
          {{ appConfirmationState.cancelText || t('common.cancel') }}
        </v-btn>
        <v-btn
          v-if="appConfirmationState.actionText"
          color="primary"
          variant="text"
          append-icon="mdi-arrow-right-thin"
          :disabled="appConfirmationState.actionRunning"
          @click="runAppConfirmationAction()"
        >
          {{ appConfirmationState.actionText }}
        </v-btn>
        <v-btn
          :color="confirmColor"
          variant="flat"
          @click="resolveAppConfirmation(true)"
        >
          {{ appConfirmationState.confirmText || t('common.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.app-confirmation-dialog {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md) !important;
}

.app-confirmation-dialog__title {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 8px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0;
  white-space: normal;
}

.app-confirmation-dialog__icon {
  display: grid;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: var(--app-radius-sm);
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}

.app-confirmation-dialog__icon[data-kind='warning'] {
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.12);
}

.app-confirmation-dialog__icon[data-kind='error'] {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.1);
}

.app-confirmation-dialog__message {
  padding-top: 4px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 13px;
  line-height: 1.65;
}

.app-confirmation-dialog__actions {
  flex-wrap: wrap;
  row-gap: 8px;
}
</style>
