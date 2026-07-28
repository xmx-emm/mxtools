<script setup lang="ts">
import {onMounted} from 'vue';
import {useI18n} from 'vue-i18n';
import RequestAdministratorPrivileges from '@/components/utils/RequestAdministratorPrivileges.vue';
import RdpStatus from '@/components/windows/rdp/RdpStatus.vue';
import WindowsUserManagement from '@/components/windows/rdp/WindowsUserManagement.vue';
import RdpUserManagement from '@/components/windows/rdp/RdpUserManagement.vue';
import RdpPortCheck from '@/components/windows/rdp/RdpPortCheck.vue';
import RdpQuickConnect from '@/components/windows/rdp/RdpQuickConnect.vue';
import {useRdpStore} from '@/stores/rdp.ts';

const { t } = useI18n();
const store = useRdpStore();

onMounted(() => {
  store.loadAll();
});
</script>

<template>
  <div class="page-content">
    <RequestAdministratorPrivileges :text="t('rdp.requestAdmin')"/>
    <RdpStatus/>
    <WindowsUserManagement/>
    <RdpUserManagement/>
    <RdpPortCheck/>
    <RdpQuickConnect/>
  </div>
</template>
