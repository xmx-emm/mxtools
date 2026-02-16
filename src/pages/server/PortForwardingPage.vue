<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import AddPortForwarding from '@/components/port_forwrarding/AddPortForwarding.vue';
import ClearPortForwarding from '@/components/port_forwrarding/ClearPortForwarding.vue';
import RequestAdministratorPrivileges from '@/components/utils/RequestAdministratorPrivileges.vue';
import BackupsPortForwarding from '@/components/backups/BackupsPortForwarding.vue';
import { usePortForwardingStore } from '@/stores/port_forwarding.ts';
import ListPortForwarding from '@/components/port_forwrarding/ListPortForwarding.vue';

const { t } = useI18n();
const state = usePortForwardingStore();
onMounted(state.update);
</script>

<template>
  <div class="page-content d-flex flex-column">
    <RequestAdministratorPrivileges :text="t('portForwarding.requestAdmin')" />
    <v-card variant="tonal" class="mb-4" :title="t('portForwarding.title')" :text="t('portForwarding.description')">
      <v-card-actions>
        <BackupsPortForwarding @import_finished="state.update" />
        <v-spacer />
        <AddPortForwarding />
        <v-btn @click="state.update" prepend-icon="mdi-refresh">{{ t('portForwarding.update') }}</v-btn>
        <ClearPortForwarding/>
      </v-card-actions>
    </v-card>
    <ListPortForwarding/>
  </div>
</template>
<style scoped>
</style>
