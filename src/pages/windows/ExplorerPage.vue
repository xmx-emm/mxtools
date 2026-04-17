<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import RequestAdministratorPrivileges from '@/components/utils/RequestAdministratorPrivileges.vue';
import CommonFolders from '@/components/window/CommonFolders.vue';

const { t } = useI18n();
</script>

<template>
  <div class="page-content">
    <RequestAdministratorPrivileges :text="t('explorer.requestAdmin')"/>
    <CommonFolders/>
  </div>
</template>
