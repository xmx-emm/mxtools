<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {routeFullPath} from '../utils/router.ts';
import {useRoute} from 'vue-router';
import {computed} from 'vue';
import ToolCategoryHome from '@/components/navigation/ToolCategoryHome.vue';

const { t } = useI18n();
const route = useRoute();
const isServer = computed(() => routeFullPath(route) === '/tools/server');

const serverItems = computed(() => [
  {
    path: '/port_forwarding',
    title: t('server.portForwardingTitle'),
    description: t('server.portForwardingDescription'),
    action: t('server.openTool'),
    badge: t('server.available'),
    icon: 'mdi-server-network',
    features: [t('server.featureRules'), t('server.featureBackup'), t('server.featureAdmin')],
  },
]);

const serverGuides = computed(() => [
  {title: t('server.guideCreate'), description: t('server.guideCreateDesc'), icon: 'mdi-plus'},
  {title: t('server.guideVerify'), description: t('server.guideVerifyDesc'), icon: 'mdi-lan-connect'},
  {title: t('server.guideBackup'), description: t('server.guideBackupDesc'), icon: 'mdi-archive-minus-outline'},
]);
</script>

<template>
  <ToolCategoryHome
    v-if="isServer"
    :eyebrow="t('server.eyebrow')"
    :title="t('server.home')"
    :subtitle="t('server.subtitle')"
    :summary="t('server.summary')"
    summary-icon="mdi-server"
    :section-title="t('server.sectionTitle')"
    :section-subtitle="t('server.sectionSubtitle')"
    :guide-title="t('server.guideTitle')"
    :guide-subtitle="t('server.guideSubtitle')"
    :items="serverItems"
    :guides="serverGuides"
  />
  <div v-else class="page-host">
    <div class="page-host__scroll">
      <router-view/>
    </div>
  </div>
</template>
