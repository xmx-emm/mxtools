<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {openConfigFileFolder} from '@/utils/open-folder.ts';
import SteamUser from '@/components/game/SteamUser.vue';
import PubgApply from '@/components/game/pubg/PubgApply.vue';
import PubgCopyButton from '@/components/game/pubg/PubgCopyButton.vue';
import PubgSelectLaunchOptions from '@/components/game/pubg/PubgSelectLaunchOptions.vue';
import PubgStart from '@/components/game/pubg/PubgStart.vue';
import GameRefreshIconButton from '@/components/game/common/GameRefreshIconButton.vue';
import steamStore from '@/stores/game/steam.ts';
import pubgStore from '@/stores/game/pubg.ts';
import {registerHmrCleanup} from '@/utils/hmr.ts';

const { t } = useI18n();
const toast = useToast();
const steam_store = steamStore();
const pubg_store = pubgStore();

const is_content_loading = computed(() =>
  pubg_store.is_accounts_loading || pubg_store.is_start_loading,
);

const refresh_loading = ref(false);

async function reload_pubg_launch_options() {
  if (refresh_loading.value) return;
  refresh_loading.value = true;
  try {
    await pubg_store.reload_launch_page();
  } finally {
    refresh_loading.value = false;
  }
}

async function open_steam_launch_config_folder() {
  const user = steam_store.active_steam_user;
  if (!user) {
    toast.warning(t('steam.emptyUserList'));
    return;
  }
  try {
    await openConfigFileFolder(user.config_path);
  } catch (e) {
    toast.error(String(e));
  }
}

function on_visibility_change() {
  if (document.visibilityState === 'visible') {
    void steam_store.check_is_steam_running();
  }
}

onMounted(async () => {
  await pubg_store.refresh_steam_accounts();
  pubg_store.start_launch();
  await steam_store.check_is_steam_running();
  window.addEventListener('visibilitychange', on_visibility_change);
  if (import.meta.env.DEV) {
    registerHmrCleanup(() => {
      window.removeEventListener('visibilitychange', on_visibility_change);
    });
  }
});

onUnmounted(() => {
  window.removeEventListener('visibilitychange', on_visibility_change);
});
</script>

<template>
  <v-col cols="12" class="page-content game-page-layout d-flex flex-column h-100 w-100 position-relative">
    <v-overlay
      :model-value="is_content_loading"
      contained
      persistent
      class="align-center justify-center"
      scrim="rgba(0,0,0,0.25)"
    >
      <v-progress-circular indeterminate color="primary" />
    </v-overlay>
    <div class="game-page-toolbar">
      <SteamUser @update_user="pubg_store.start_launch()" />
    </div>

    <div class="game-page-gap"/>

    <div class="game-page-main">
      <PubgSelectLaunchOptions style="flex:1;min-height:0;"/>
    </div>

    <div class="game-page-gap"/>

    <div class="game-page-actions">
      <v-btn-group density="compact" divided>
        <PubgCopyButton/>
        <GameRefreshIconButton
          :loading="refresh_loading"
          :title="`${t('apex.loadFromSteam')} · ${t('common.rightClickOpenConfigFolder')}`"
          @click="reload_pubg_launch_options"
          @contextmenu="open_steam_launch_config_folder"
        />
      </v-btn-group>

      <v-spacer></v-spacer>

      <v-btn-group density="compact" divided>
        <PubgStart/>
        <PubgApply/>
      </v-btn-group>
    </div>

    <v-dialog
      v-model="pubg_store.tip_dialog"
      content-class="pubg-tip-dialog-no-ripple"
    >
      <component
        :is="pubg_store.tip_view"
        class="not_select"
        @contextmenu.prevent="pubg_store.closeTip()"
      />
    </v-dialog>
  </v-col>
</template>

<style>
.pubg-tip-dialog-no-ripple .v-ripple__container {
  display: none !important;
}
</style>
