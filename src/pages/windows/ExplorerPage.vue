<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import RequestAdministratorPrivileges from '@/components/utils/RequestAdministratorPrivileges.vue';
import CommonFolders from '@/components/windows/CommonFolders.vue';
import ContextMenuCustomFolders from '@/components/windows/ContextMenuCustomFolders.vue';
import ContextMenuManager from '@/components/windows/ContextMenuManager.vue';

const { t } = useI18n();
</script>

<template>
  <div class="page-content d-flex flex-column">
    <RequestAdministratorPrivileges :text="t('explorer.requestAdmin')"/>
    <CommonFolders/>
    <ContextMenuCustomFolders/>
    <ContextMenuManager/>
  </div>
</template>
