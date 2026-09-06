<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {isTauri} from '@tauri-apps/api/core';
import {useI18n} from 'vue-i18n';
import {getInstalledGameVersion} from '@/ipc/commands.ts';
import {gameVersionStatus, type InstalledGameVersion, type SupportedGame} from '@/utils/game/version_support.ts';

const props = withDefaults(defineProps<{game: SupportedGame; platform?: 'steam' | 'ea'; eaUserId?: string | null}>(), {platform: 'steam', eaUserId: null});
const {t} = useI18n();
const value = ref<InstalledGameVersion | null>(null);
const loading = ref(false);
let generation = 0;
let refreshedAt = 0;
const status = computed(() => gameVersionStatus(props.game, value.value));
const version = computed(() => value.value?.version || (value.value?.build ? 'Build ' + value.value.build : t('gameVersion.unknown')));
const tooltip = computed(() => [t('gameVersion.' + status.value), value.value?.build].filter(Boolean).join(' · '));
async function refresh() {
  const request = ++generation;
  value.value = null;
  loading.value = false;
  if (!isTauri() || (props.platform === 'ea' && !props.eaUserId)) return;
  loading.value = true;
  try {
    const result = await getInstalledGameVersion({game: props.game, platform: props.platform, eaUserId: props.eaUserId});
    if (request === generation) { value.value = result; refreshedAt = Date.now(); }
  } catch { /* Unknown is distinct from an unsupported installed build. */ }
  finally { if (request === generation) loading.value = false; }
}
function onFocus() { if (!loading.value && Date.now() - refreshedAt > 15000) void refresh(); }
watch(() => [props.game, props.platform, props.eaUserId], () => void refresh(), {immediate: true});
onMounted(() => window.addEventListener('focus', onFocus));
onBeforeUnmount(() => { generation++; window.removeEventListener('focus', onFocus); });
</script>

<template>
  <v-tooltip :text="tooltip" location="top">
    <template #activator="{props: tooltipProps}">
      <span v-bind="tooltipProps" class="game-version-status" :class="{'text-warning': status === 'unverified'}" role="status">
        <v-icon v-if="status === 'unverified'" icon="mdi-alert-outline" size="14"/>
        <span>{{ t('gameVersion.current') }}: {{ loading ? t('gameVersion.checking') : version }}</span>
        <span v-if="!loading" class="game-version-support">{{ t('gameVersion.' + status) }}</span>
      </span>
    </template>
  </v-tooltip>
</template>

<style scoped>
.game-version-status { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-width: 0; max-width: 100%; margin: 0 10px; font-size: 11px; line-height: 1.5; color: rgba(var(--v-theme-on-surface), .6); overflow-wrap: anywhere; }
.game-version-support { white-space: nowrap; }
</style>
