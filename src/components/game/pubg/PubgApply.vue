<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {computed, ref} from 'vue';
import {useToast} from 'vue-toastification';
import {useSteamStore} from '@/stores/game/steam.ts';
import {usePubgStore} from '@/stores/game/pubg.ts';
import CloseSteamApplyAccount from '@/components/game/CloseSteamApplyAccount.vue';
import {
  formatApplyLaunchOptionError,
  useApplyButtonClass,
  useCloseLauncherThenApply,
} from '@/composables/useCloseLauncherThenApply.ts';
import {setPubgLaunchOption} from '@/ipc/commands.ts';

const {t} = useI18n();
const toast = useToast();
const steam_store = useSteamStore();
const pubg_store = usePubgStore();
const is_setting_launch_option = ref(false);

async function set_launch_option() {
  if (is_setting_launch_option.value) return;
  is_setting_launch_option.value = true;
  try {
    const user = steam_store.active_steam_user;
    if (!user) {
      toast.error('apex.noLauncherAccount');
      return;
    }
    const id = Number(user.id);
    if (!Number.isFinite(id) || id <= 0) {
      toast.error(
        formatApplyLaunchOptionError(new Error(t('pubg.invalidSteamUserId', {id: user.id}))),
        {timeout: 8000},
      );
      return;
    }
    try {
      await setPubgLaunchOption({
        id,
        launchOption: pubg_store.launch_options,
      });
      toast.success('toast.applyLaunchOptionSuccess');
      pubg_store.original_launch_options = pubg_store.launch_options;
      pubg_store.launch_loaded_for_user_id = user.id;
      dialog.value = false;
    } catch (err) {
      console.warn('set_pubg_launch_option failed', err);
      toast.error(formatApplyLaunchOptionError(err), {timeout: 8000});
      dialog.value = false;
    }
  } finally {
    is_setting_launch_option.value = false;
  }
}

const {
  dialog,
  is_thoroughly_kill,
  is_apply_running,
  apply_check,
  force_close_launcher,
  cancel,
} = useCloseLauncherThenApply({
  apply: set_launch_option,
  beforeApply: async () => {
    if (!steam_store.active_steam_user) {
      toast.error('apex.noLauncherAccount');
      return false;
    }
    return true;
  },
});

const apply_button_class = useApplyButtonClass({
  busy: computed(
    () =>
      pubg_store.is_start_loading ||
      is_setting_launch_option.value ||
      is_apply_running.value ||
      !steam_store.active_steam_user,
  ),
  modified: computed(() => !!steam_store.active_steam_user && pubg_store.is_launch_options_modified),
  needsWarning: computed(() => steam_store.is_steam_running),
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
        prepend-icon="mdi-steam"
        :title="t('apex.closeSteam')"
      >
        <v-card-text>
          <p class="mb-0">
            {{ t('apex.closeSteamTip') }}
          </p>
          <CloseSteamApplyAccount :user="steam_store.active_steam_user" />
        </v-card-text>
        <template v-slot:actions>
          <v-btn
            @click="force_close_launcher"
            color="red"
            :loading="is_thoroughly_kill"
          >
            {{ t('apex.forceClose') }}
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn @click="cancel">
            {{ t('common.cancel') }}
          </v-btn>
        </template>
        <template v-slot:prepend>
          <div class="pe-4">
            <v-icon size="x-large" color="red"></v-icon>
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
