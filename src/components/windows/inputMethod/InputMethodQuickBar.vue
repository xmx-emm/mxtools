<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import type {InputMethodItem} from '@/types/inputMethod.ts';
import {
  addUsKeyboard as ipcAddUsKeyboard,
  disableChsSimplifiedTraditionalHotkey,
} from '@/ipc/commands.ts';

const props = defineProps<{
  items: InputMethodItem[];
  saving: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  'update:saving': [value: boolean];
}>();

const { t } = useI18n();
const toast = useToast();

const hasChsIme = computed(() =>
  props.items.some(
    (i) => i.capabilities.is_microsoft_pinyin || i.capabilities.is_microsoft_wubi,
  ),
);

async function addUsKeyboard() {
  if (props.saving) return;
  emit('update:saving', true);
  try {
    await ipcAddUsKeyboard();
    emit('refresh');
    toast.success(t('inputMethod.quickActions.usKeyboardDone'));
    toast.info(t('inputMethod.restartHint'));
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    emit('update:saving', false);
  }
}

async function disableSimplifiedTraditionalHotkey() {
  if (props.saving) return;
  emit('update:saving', true);
  try {
    await disableChsSimplifiedTraditionalHotkey();
    toast.success(t('inputMethod.quickActions.disableHotkeyDone'));
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    emit('update:saving', false);
  }
}
</script>

<template>
  <v-card variant="flat" class="quick-bar mb-4">
    <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
      {{ t('inputMethod.quickActions.title') }}
    </v-card-title>
    <v-card-text class="d-flex flex-wrap ga-2">
      <v-btn
        variant="tonal"
        rounded="lg"
        prepend-icon="mdi-keyboard"
        :loading="saving"
        @click="addUsKeyboard"
      >
        {{ t('inputMethod.quickActions.addUsKeyboard') }}
      </v-btn>
      <v-btn
        v-if="hasChsIme"
        variant="tonal"
        rounded="lg"
        prepend-icon="mdi-toggle-switch-off"
        :loading="saving"
        @click="disableSimplifiedTraditionalHotkey"
      >
        {{ t('inputMethod.quickActions.disableHotkey') }}
      </v-btn>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.quick-bar {
  border: 1px solid rgba(var(--v-border-color), 0.08);
  border-radius: 12px;
}
</style>
