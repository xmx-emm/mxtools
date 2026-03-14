<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import SteamUser from '@/components/game/SteamUser.vue';
import {steamStore} from '@/stores/game/steam.ts';
import {onMounted, onUnmounted, ref} from 'vue';
import ApexApply from '@/components/game/apex/ApexApply.vue';
import ApexStart from '@/components/game/apex/ApexStart.vue';
import ApexApexCopyButton from '@/components/game/apex/ApexCopyButton.vue';
import ApexSelectLaunchOptions from '@/components/game/apex/ApexSelectLaunchOptions.vue';
import apexStore from '@/stores/game/apex.ts';
import ApexManualDownloadMilesLanguage from '@/components/game/apex/language/ApexManualDownloadMilesLanguage.vue';
import ApexSemiAutomaticDownloadLanguage from "@/components/game/apex/language/ApexSemiAutomaticDownloadLanguage.vue";

const { t } = useI18n();
const steam_store = steamStore();
const apex_store = apexStore();

const interval_id = ref<number | any>(null);

onMounted(async () => {
  steam_store.refresh_users()
  interval_id.value = setInterval(async () => {
    await steam_store.check_is_steam_running()
  }, 5000);
})
onUnmounted(() => {
  clearInterval(interval_id.value);
})
</script>
<template>
  <v-col class="page-content d-flex flex-column h-100" >
    <div>
      <SteamUser @update_user="apex_store.start_launch()">
        <v-tooltip :text="t('apex.steamId')">
          <template v-slot:activator="{ props }"><p v-bind="props">Apex</p></template>
        </v-tooltip>
      </SteamUser>
    </div>

    <v-spacer class="spacer"/>
    <ApexSelectLaunchOptions
        style="flex:1;"/>
    <v-spacer class="spacer"/>

    <div style="display: flex;">
      <v-btn-group  class="button">
        <ApexApexCopyButton/>
        <v-btn icon="mdi-refresh" @click="apex_store.start_launch" :title="t('apex.loadFromSteam')"></v-btn>
      </v-btn-group>
      <v-spacer></v-spacer>
      <v-btn-group class="button">
        <ApexStart/>
        <ApexApply/>
      </v-btn-group>
    </div>

<!--    弹出窗口-->
    <v-dialog v-model="apex_store.tip_dialog">
      <component :is="apex_store.tip_view" class="not_select"
                 @contextmenu.prevent="apex_store.closeTip()"/>
    </v-dialog>
    <ApexManualDownloadMilesLanguage/>
    <ApexSemiAutomaticDownloadLanguage/>

  </v-col>
</template>
<style scoped>
.spacer{
  max-height: 5px;
}
.button{
  max-height: 35px;
}
</style>
