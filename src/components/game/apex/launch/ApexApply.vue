<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {computed, ref} from 'vue';
import {useToast} from 'vue-toastification';
import {useEaStore} from '@/stores/game/ea.ts';
import {useSteamStore} from '@/stores/game/steam.ts';
import {useApexStore} from '@/stores/game/apex.ts';
import CloseSteamApplyAccount from '@/components/game/CloseSteamApplyAccount.vue';
import {
  formatApplyLaunchOptionError,
  useApplyButtonClass,
  useCloseLauncherThenApply,
} from '@/composables/useCloseLauncherThenApply.ts';

const { t } = useI18n();
const steam_store = useSteamStore();
const ea_store = useEaStore();
const apex_store = useApexStore();
const toast = useToast();

const is_setting_launch_option = ref(false);

async function set_launch_option() {
  if (is_setting_launch_option.value) return;
  is_setting_launch_option.value = true;
  try {
    await apex_store.persist_launch_options();
    toast.success('toast.applyLaunchOptionSuccess');
    dialog.value = false;
  } catch (err) {
    console.warn('set_launch_option failed', err);
    const detail = (err instanceof Error ? err.message : String(err ?? '')).trim();
    if (detail === 'NO_LAUNCHER_ACCOUNT') {
      toast.error('apex.noLauncherAccount');
    } else {
      toast.error(formatApplyLaunchOptionError(err), {timeout: 8000});
    }
    dialog.value = false;
  } finally {
    is_setting_launch_option.value = false;
  }
}

const {
  dialog,
  close_launcher_kind,
  is_thoroughly_kill,
  is_apply_running,
  apply_check,
  force_close_launcher,
  cancel,
} = useCloseLauncherThenApply({
  apply: set_launch_option,
  beforeApply: async () => {
    if (!apex_store.active_apex_account) {
      toast.error('apex.noLauncherAccount');
      return false;
    }
    if (!await apex_store.check_miles_language()) {
      toast.error('toast.milesLanguageNotFound');
      if (apex_store.active_apex_account?.kind === 'ea') {
        apex_store.download_miles_language_manual_dialog_ea = true;
      } else {
        apex_store.download_miles_language_semi_automatic_dialog = true;
      }
      return false;
    }
    return true;
  },
  resolveCloseKind: async () => {
    const acc = apex_store.active_apex_account;
    if (!acc) return null;
    if (acc.kind === 'ea') {
      await ea_store.check_is_ea_desktop_running();
      return ea_store.is_ea_desktop_running ? 'ea' : null;
    }
    await steam_store.check_is_steam_running();
    return steam_store.is_steam_running ? 'steam' : null;
  },
});

const apply_button_class = useApplyButtonClass({
  busy: computed(() => apex_store.is_start_loading || is_setting_launch_option.value || !apex_store.active_apex_account),
  modified: computed(() => !!apex_store.active_apex_account && apex_store.is_launch_options_modified),
  needsWarning: computed(() => {
    const acc = apex_store.active_apex_account;
    if (!acc) return false;
    if (acc.kind === 'steam') {
      return steam_store.is_steam_running || !apex_store.is_miles_language_ready;
    }
    return ea_store.is_ea_desktop_running || !apex_store.is_miles_language_ready;
  }),
});

const close_dialog_title = computed(() =>
  close_launcher_kind.value === 'steam' ? t('apex.closeSteam') : t('apex.closeEaDesktop'),
);

const close_dialog_text = computed(() =>
  close_launcher_kind.value === 'steam' ? t('apex.closeSteamTip') : t('apex.closeEaDesktopTip'),
);

const close_dialog_icon = computed(() =>
  close_launcher_kind.value === 'steam' ? 'mdi-steam' : 'mdi-alpha-e-circle',
);

const close_steam_apply_user = computed(() => {
  const acc = apex_store.active_apex_account;
  return acc?.kind === 'steam' ? acc.user : null;
});
</script>

<template>
  <v-dialog
    v-model="dialog"
    max-width="400"
    persistent
  >
    <template v-slot:activator>
      <v-btn
        @click.stop="apply_check"
        :loading="is_apply_running"
        :title="t('apex.applyLaunchOptions')"
        :class="apply_button_class"
      >
        {{ t('apex.apply') }}
      </v-btn>
    </template>
    <template v-slot:default>
      <v-card
        :prepend-icon="close_dialog_icon"
        :title="close_dialog_title"
      >
        <v-card-text>
          <p class="mb-0">
            {{ close_dialog_text }}
          </p>
          <CloseSteamApplyAccount
            v-if="close_launcher_kind === 'steam'"
            :user="close_steam_apply_user"
          />
        </v-card-text>
        <template v-slot:actions>
          <v-btn
            @click="force_close_launcher"
            color="error"
            variant="flat"
            :loading="is_thoroughly_kill"
          >
            {{ t('apex.forceClose') }}
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn variant="text" :disabled="is_thoroughly_kill" @click="cancel">
            {{ t('common.cancel') }}
          </v-btn>
        </template>
        <template v-slot:prepend>
          <div class="pe-4">
            <v-icon
              size="x-large"
              color="red"
            />
          </div>
        </template>
        <template v-slot:append>
          <v-progress-circular
            indeterminate="disable-shrink"
            size="16"
            color="red"
            width="2"
          />
        </template>
      </v-card>
    </template>
  </v-dialog>
</template>

<style scoped>
</style>
