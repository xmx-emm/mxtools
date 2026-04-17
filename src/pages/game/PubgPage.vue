<script setup lang="ts">
import {onMounted, onUnmounted, ref} from 'vue';
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

onMounted(async () => {
  steam_store.refresh_users();
  interval_id.value = setInterval(async () => {
    await steam_store.check_is_steam_running();
  }, 5000);
});

onUnmounted(() => {
  clearInterval(interval_id.value);
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

