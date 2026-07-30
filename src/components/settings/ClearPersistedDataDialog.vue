<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {useSettingsStore} from '@/stores/settings.ts';
import {useDebugStore} from '@/stores/debug.ts';
import {useUiStyleStore} from '@/stores/style.ts';
import {setDebugEnabled} from '@/utils/debug.ts';
import {useSteamStore} from '@/stores/game/steam.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import {useApexStore} from '@/stores/game/apex.ts';
import {ref} from 'vue';
import {useToast} from 'vue-toastification';
import {applyDocumentLocale, resolveLocale} from '@/utils/locale.ts';
import {applyAccentTheme} from '@/vuetify.ts';
import {DEFAULT_ACCENT} from '@/themes.ts';
import {applyLocaleToggleShortcut} from '@/utils/global-shortcuts.ts';
import {
  applyWindowBehavior,
  defaultWindowBehaviorPrefs,
  saveWindowBehaviorPrefs,
} from '@/utils/window_behavior.ts';

const emit = defineEmits<{ cleared: [] }>();

const { t, locale: i18nLocale } = useI18n();
const toast = useToast();
const settingsStore = useSettingsStore();
const debugStore = useDebugStore();
const uiStore = useUiStyleStore();
const steam_store = useSteamStore();
const ea_store = useEaStore();
const apex_store = useApexStore();

const clearConfirmDialog = ref(false);

async function clearPersistedData() {
  settingsStore.$reset();
  debugStore.$reset();
  setDebugEnabled(import.meta.env.DEV);
  uiStore.$reset();
  steam_store.$reset();
  ea_store.$reset();
  apex_store.$reset();
  try {
    localStorage.removeItem('mx-theme');
    localStorage.removeItem('mx-theme-preference');
    localStorage.removeItem('mx-accent');
  } catch { /* localStorage may be unavailable */
  }
  applyAccentTheme(DEFAULT_ACCENT);
  i18nLocale.value = resolveLocale(settingsStore.locale);
  applyDocumentLocale(settingsStore.locale);
  await applyLocaleToggleShortcut();
  const cleared = defaultWindowBehaviorPrefs();
  saveWindowBehaviorPrefs(cleared);
  await applyWindowBehavior(cleared);
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
          variant="text"
          @click="clearConfirmDialog = false">{{ t('common.cancel') }}
        </v-btn>
        <v-btn color="error" variant="flat" @click="clearPersistedData">{{ t('common.confirm') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
