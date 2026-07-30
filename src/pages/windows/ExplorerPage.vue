<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import RequestAdministratorPrivileges from '@/components/utils/RequestAdministratorPrivileges.vue';
import CommonFolders from '@/components/windows/CommonFolders.vue';
import ContextMenuCustomFolders from '@/components/windows/ContextMenuCustomFolders.vue';
import ContextMenuManager from '@/components/windows/ContextMenuManager.vue';
import {useSettingsStore} from '@/stores/settings.ts';

const { t } = useI18n();
const settingsStore = useSettingsStore();
</script>

<template>
  <div class="page-content d-flex flex-column">
    <RequestAdministratorPrivileges :text="t('explorer.requestAdmin')"/>
    <CommonFolders/>
    <ContextMenuCustomFolders v-if="settingsStore.betaFeaturesEnabled"/>
    <ContextMenuManager v-if="settingsStore.betaFeaturesEnabled"/>
  </div>
</template>
