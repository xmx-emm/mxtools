<script setup lang="ts">
import {onMounted, onUnmounted, ref} from 'vue';
import {onBeforeRouteLeave} from 'vue-router';
import SteamUser from '@/components/game/SteamUser.vue';
import PubgApply from '@/components/game/pubg/PubgApply.vue';
import PubgCopyButton from '@/components/game/pubg/PubgCopyButton.vue';
import PubgSelectLaunchOptions from '@/components/game/pubg/PubgSelectLaunchOptions.vue';
import PubgStart from '@/components/game/pubg/PubgStart.vue';
import steamStore from '@/stores/game/steam.ts';
import pubgStore from '@/stores/game/pubg.ts';

const steam_store = steamStore();
const pubg_store = pubgStore();

const interval_id = ref<number | any>(null);
const NORMAL_STATUS_POLL_MS = 15000;

function stop_status_polling() {
  if (!interval_id.value) return;
  clearInterval(interval_id.value);
  interval_id.value = null;
}

function start_status_polling() {
  stop_status_polling();
  interval_id.value = setInterval(async () => {
    await steam_store.check_is_steam_running();
  }, NORMAL_STATUS_POLL_MS);
}

onMounted(async () => {
  await steam_store.refresh_users();
  await steam_store.check_is_steam_running();
  start_status_polling();
});

onUnmounted(() => {
  stop_status_polling();
});

onBeforeRouteLeave(() => {
  stop_status_polling();
});
</script>

<template>
  <v-col class="page-content d-flex flex-column h-100">
    <div>
      <SteamUser @update_user="pubg_store.start_launch()" />
    </div>

    <v-spacer class="spacer"/>

    <PubgSelectLaunchOptions style="flex:1;"/>

    <v-spacer class="spacer"/>

    <div style="display: flex;">
      <v-btn-group class="button">
        <PubgCopyButton/>
        <v-btn
          icon="mdi-refresh"
          @click="pubg_store.start_launch"
          title="从 Steam 加载配置"
        />
      </v-btn-group>

      <v-spacer></v-spacer>

      <v-btn-group class="button">
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

<style scoped>
.spacer {
  max-height: 5px;
}

.button {
  max-height: 35px;
}
</style>

<style>
.pubg-tip-dialog-no-ripple .v-ripple__container {
  display: none !important;
}
</style>

