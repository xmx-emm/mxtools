<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexLauncherUser from '@/components/game/apex/ApexLauncherUser.vue';
import eaStore from '@/stores/game/ea.ts';
import steamStore from '@/stores/game/steam.ts';
import {onMounted, onUnmounted, ref} from 'vue';
import ApexApply from '@/components/game/apex/ApexApply.vue';
import ApexStart from '@/components/game/apex/ApexStart.vue';
import ApexApexCopyButton from '@/components/game/apex/ApexCopyButton.vue';
import ApexSelectLaunchOptions from '@/components/game/apex/ApexSelectLaunchOptions.vue';
import apexStore from '@/stores/game/apex.ts';
import ApexSteamManualDownloadMilesLanguage
  from '@/components/game/apex/language/steam/ApexManualDownloadMilesLanguage.vue';
import ApexEaManualDownloadMilesLanguage from '@/components/game/apex/language/ea/ApexManualDownloadMilesLanguage.vue';
import ApexSemiAutomaticDownloadLanguage
  from '@/components/game/apex/language/steam/ApexSemiAutomaticDownloadLanguage.vue';
import ApexFilter from '@/components/game/apex/ApexFilter.vue';

const { t } = useI18n();
const { check_is_steam_running, refresh_users } = steamStore();
const ea_store = eaStore();
const apex_store = apexStore();

const interval_id = ref<number | any>(null);

onMounted(async () => {
  await refresh_users();
  await apex_store.refresh_apex_accounts();
  // 子组件 onMounted 先于本页,故不能在 ApexSelectLaunchOptions 里首屏 start_launch,否则会先于 refresh 触发 noLauncherAccount
  apex_store.start_launch();
  await ea_store.check_is_ea_desktop_running();
  interval_id.value = setInterval(async () => {
    await check_is_steam_running();
    await ea_store.check_is_ea_desktop_running();
  }, 5000);
});
onUnmounted(() => {
  clearInterval(interval_id.value);
});

async function reload_apex_launch_options() {
  await apex_store.refresh_apex_accounts();
  apex_store.start_launch();
}

</script>
<template>
  <v-col cols="12" class="page-content d-flex flex-column h-100 w-100">
    <div class="apex-page-toolbar">
      <div class="apex-page-toolbar__user">
        <ApexLauncherUser @update_user="apex_store.start_launch()" />
      </div>
      <div class="apex-page-toolbar__filter">
        <ApexFilter />
      </div>
    </div>

    <v-spacer class="spacer"/>
    <ApexSelectLaunchOptions
      style="flex:1;"/>
    <v-spacer class="spacer"/>

    <div class="apex-page-actions">
      <v-btn-group class="button">
        <ApexApexCopyButton/>
        <v-btn
          icon="mdi-refresh"
          :title="t('apex.reloadLaunchOptions')"
          @click="reload_apex_launch_options"
        />
      </v-btn-group>
      <v-spacer></v-spacer>
      <v-btn-group class="button">
        <ApexStart/>
        <ApexApply/>
      </v-btn-group>
    </div>

    <!--    弹出窗口-->
    <v-dialog
      v-model="apex_store.tip_dialog"
      content-class="apex-tip-dialog-no-ripple"
    >
      <component
        :is="apex_store.tip_view"
        class="not_select"
        @contextmenu.prevent="apex_store.closeTip()"
      />
    </v-dialog>
    <ApexSteamManualDownloadMilesLanguage/>
    <ApexEaManualDownloadMilesLanguage/>
    <ApexSemiAutomaticDownloadLanguage/>

  </v-col>
</template>
<style scoped>
.spacer {
  max-height: 5px;
}

.button {
  max-height: 35px;
  min-width: 0;
}

/**
 * 左侧占满剩余宽度(可省略),右侧筛选为内容宽度并贴齐右缘.
 * 勿给右侧 flex:1,否则内部搜索会从「右侧栏左缘」排布,留下大片空白.
 */
.apex-page-toolbar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.apex-page-toolbar__user {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.apex-page-toolbar__filter {
  flex: 0 0 auto;
  min-width: 0;
}

.apex-page-actions {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.apex-page-actions :deep(.v-btn-group) {
  min-width: 0;
  max-width: 100%;
  flex-wrap: nowrap;
  overflow: hidden;
}
</style>

<style>
.apex-tip-dialog-no-ripple .v-ripple__container {
  display: none !important;
}
</style>
