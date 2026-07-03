<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';

const props = defineProps<{
  uncommon?: boolean;
  notInGameSettings?: boolean;
}>();

const { t } = useI18n();

const visible = computed(() => props.uncommon || props.notInGameSettings);
</script>

<template>
  <span v-if="visible" class="apex-list-item-badges">
    <v-icon
      v-if="uncommon"
      icon="mdi-archive-minus-outline"
      size="14"
      :title="t('apex.uncommonItemTip')"
    />
    <v-icon
      v-if="notInGameSettings"
      icon="mdi-file-excel"
      size="14"
      :title="t('apex.notInGameSettingsTip')"
    />
  </span>
</template>

<style scoped>
.apex-list-item-badges {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-inline-start: 8px;
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.42);
  vertical-align: middle;
}

.apex-list-item-badges :deep(.v-icon) {
  cursor: default;
  transition: color 0.15s ease;
}

.apex-list-item-badges :deep(.v-icon:hover) {
  color: rgba(var(--v-theme-on-surface), 0.72);
}
</style>
