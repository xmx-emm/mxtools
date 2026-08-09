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
import {useSteamStore} from '@/stores/game/steam.ts';
import {usePubgStore} from '@/stores/game/pubg.ts';
import {registerHmrCleanup} from '@/utils/hmr.ts';

const { t } = useI18n();
const toast = useToast();
const steam_store = useSteamStore();
const pubg_store = usePubgStore();

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
    <div class="pubg-page-toolbar game-page-toolbar">
      <div class="pubg-page-heading">
        <div class="pubg-page-eyebrow">
          <v-icon icon="mdi-gamepad-variant-outline" size="small" />
          <span>{{ t('nav.pubg') }}</span>
        </div>
        <h1 class="pubg-page-title">{{ t('game.pubgTitle') }}</h1>
        <p class="pubg-page-subtitle">{{ t('game.pubgDescription') }}</p>
      </div>
      <div class="pubg-page-account">
        <SteamUser
          :account-hint="t('nav.pubg')"
          @update_user="pubg_store.start_launch()"
        />
      </div>
    </div>

    <div class="game-page-gap"/>

    <div class="game-page-main">
      <PubgSelectLaunchOptions style="flex:1;min-height:0;"/>
    </div>

    <div class="game-page-gap"/>

    <div class="game-page-actions pubg-page-actions">
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

<style scoped>
.pubg-page-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  min-height: 44px;
}

.pubg-page-heading {
  min-width: 0;
  flex: 1 1 auto;
}

.pubg-page-eyebrow {
  display: flex;
  align-items: center;
  gap: 5px;
  color: rgb(var(--v-theme-primary));
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pubg-page-eyebrow :deep(.v-icon) {
  font-size: 14px;
}

.pubg-page-title {
  margin: 3px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 16px;
  font-weight: 680;
  line-height: 1.2;
}

.pubg-page-subtitle {
  max-width: 720px;
  margin: 3px 0 0;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 11px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pubg-page-account {
  flex: 0 1 auto;
  min-width: 0;
}

.pubg-page-actions {
  padding-top: 6px;
  border-top: 1px solid var(--app-border);
}

@media (max-width: 760px) {
  .pubg-page-toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .pubg-page-account {
    order: -1;
    align-self: flex-start;
  }

  .pubg-page-subtitle {
    white-space: normal;
  }
}
</style>
