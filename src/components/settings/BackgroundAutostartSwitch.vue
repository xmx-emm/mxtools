<script setup lang="ts">
import {computed, onMounted, useId} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useBackgroundRuntimeStore} from '@/stores/background_runtime.ts';

const props = withDefaults(defineProps<{compact?: boolean}>(), {compact: false});
const {t} = useI18n();
const toast = useToast();
const runtime = useBackgroundRuntimeStore();
const statusHintId = useId();
const launchModeHintId = useId();

const statusHint = computed(() => {
  if (runtime.applyingAutostart) return t('settings.autostartStatusApplying');
  if (runtime.loading || runtime.autostartStatus === 'loading') {
    return t('settings.autostartStatusLoading');
  }
  if (runtime.autostartStatus === 'unsupported') return t('settings.autostartDebugDisabled');
  if (runtime.autostartStatus === 'mismatch') return t('settings.autostartStatusMismatch');
  return runtime.autostartStatus === 'enabled'
    ? t('settings.autostartStatusEnabled')
    : t('settings.autostartStatusDisabled');
});

const launchModeHint = computed(() => {
  if (runtime.backgroundLaunchMode === 'autostart') {
    return t('settings.autostartLaunchModeAutostart');
  }
  if (runtime.backgroundLaunchMode === 'interactive') {
    return t('settings.autostartLaunchModeInteractive');
  }
  return '';
});

const describedBy = computed(() => launchModeHint.value
  ? `${statusHintId} ${launchModeHintId}`
  : statusHintId);

async function update(value: boolean | null) {
  try {
    await runtime.setAutostart(value);
  } catch (error) {
    toast.error(String(error));
  }
}

onMounted(() => {
  if (!runtime.snapshot) void runtime.refresh().catch(() => undefined);
});
</script>

<template>
  <label class="background-autostart" :class="{'background-autostart--compact': props.compact}">
    <span class="background-autostart__copy">
      <strong>{{ t('settings.autostart') }}</strong>
      <span class="background-autostart__details" aria-live="polite">
        <small :id="statusHintId">{{ statusHint }}</small>
        <small v-if="launchModeHint" :id="launchModeHintId">{{ launchModeHint }}</small>
      </span>
    </span>
    <v-switch
      :model-value="runtime.autostartEnabled"
      :loading="runtime.loading || runtime.applyingAutostart"
      :disabled="!runtime.autostartSupported || runtime.loading || runtime.applyingAutostart"
      :aria-describedby="describedBy"
      hide-details
      color="primary"
      density="compact"
      @update:model-value="update"
    />
  </label>
</template>

<style scoped>
.background-autostart {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  gap: 20px;
  padding: 10px 18px;
}
.background-autostart__copy { display: flex; flex-direction: column; min-width: 0; gap: 3px; }
.background-autostart__details { display: flex; flex-direction: column; gap: 2px; }
.background-autostart strong { font-size: 11px; font-weight: 620; }
.background-autostart small { color: rgba(var(--v-theme-on-surface), .46); font-size: 9px; line-height: 1.4; }
.background-autostart :deep(.v-switch) { flex: 0 0 auto; }
.background-autostart--compact { min-height: 52px; padding: 8px 0; }
</style>
