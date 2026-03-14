<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import RequestAdministratorPrivileges from '@/components/utils/RequestAdministratorPrivileges.vue';
import RdpStatus from '@/components/window/rdp/RdpStatus.vue';
import WindowsUserManagement from '@/components/window/rdp/WindowsUserManagement.vue';
import RdpUserManagement from '@/components/window/rdp/RdpUserManagement.vue';
import RdpPortSettings from '@/components/window/rdp/RdpPortSettings.vue';
import RdpPortCheck from '@/components/window/rdp/RdpPortCheck.vue';
import RdpQuickConnect from '@/components/window/rdp/RdpQuickConnect.vue';
import { useRdpStore } from '@/stores/rdp.ts';

const { t } = useI18n();
const store = useRdpStore();

onMounted(() => {
  store.loadAll();
});
</script>

<template>
  <div class="page-content page-content--wide">
    <RequestAdministratorPrivileges :text="t('rdp.requestAdmin')" />
    <RdpStatus />
    <RdpPortSettings />
    <WindowsUserManagement />
    <RdpUserManagement />
    <RdpPortCheck />
    <RdpQuickConnect />
  </div>
</template>
