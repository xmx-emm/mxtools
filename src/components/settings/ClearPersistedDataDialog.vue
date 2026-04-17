<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {useSettingsStore} from '@/stores/settings';
import {uiStyleStore} from '@/stores/style.ts';
import steamStore from '@/stores/game/steam.ts';
import {ref} from 'vue';
import {useToast} from 'vue-toastification';
import {resolveLocale} from '@/utils/locale';
import {applyAccentTheme} from '@/vuetify';
import {DEFAULT_ACCENT} from '@/themes';

const emit = defineEmits<{ cleared: [] }>();

const { t, locale: i18nLocale } = useI18n();
const toast = useToast();
const settingsStore = useSettingsStore();
const uiStore = uiStyleStore();
const steam_store = steamStore();

const clearConfirmDialog = ref(false);

async function clearPersistedData() {
  settingsStore.$reset();
  uiStore.$reset();
  steam_store.$reset();
  applyAccentTheme(DEFAULT_ACCENT);
  i18nLocale.value = resolveLocale(settingsStore.locale);
  clearConfirmDialog.value = false;
  toast.success(t('settings.clearSuccess'));
  emit('cleared');
}
</script>

<template>
  <v-dialog v-model="clearConfirmDialog" max-width="400" persistent>
    <template v-slot:activator="{ props }">
      <v-btn
        color="primary"
        variant="tonal"
        rounded="lg"
        v-bind="props"
      >
        {{ t('settings.clearPersistedData') }}
      </v-btn>
    </template>
    <v-card>
      <v-card-title>{{ t('settings.clearPersistedData') }}</v-card-title>
      <v-card-text>{{ t('settings.clearPersistedDataConfirm') }}</v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn
          color="primary"
          variant="flat"
          @click="clearConfirmDialog = false">{{ t('common.cancel') }}
        </v-btn>
        <v-btn color="error" variant="flat" @click="clearPersistedData">{{ t('common.confirm') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
