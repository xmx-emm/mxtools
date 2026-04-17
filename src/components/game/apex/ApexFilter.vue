<script setup lang="ts">
import {computed} from 'vue';
import {ApexFilterEnum} from '@/enum.ts';
import apexStore from '@/stores/game/apex.ts';
import {useI18n} from 'vue-i18n';

const { t } = useI18n();
const apex_store = apexStore();

/** 有搜索内容时：类型切换禁用(搜索按「全部」范围),清空后恢复 */
const isFilterSearchActive = computed(
  () => (apex_store.filter_search ?? '').trim().length > 0
);
</script>

<template>
  <div class="d-flex flex-row align-center flex-nowrap apex-launch-filters">

    <v-text-field
      v-model="apex_store.filter_search"
      class="mb-1 apex-filter-search"
      density="compact"
      variant="underlined"
      hide-details
      clearable
      :placeholder="t('apex.filterSearchPlaceholder')"
      prepend-inner-icon="mdi-magnify"
    />
    <v-btn-toggle
      v-model="apex_store.filter_type"
      class="apex-filter-type-toggle mb-1"
      density="compact"
      mandatory
      variant="tonal"
      color="surface-variant"
      divided
      :disabled="isFilterSearchActive"
      style="height: 25px;"
    >
      <v-btn size="x-small" :value="ApexFilterEnum.normal">{{ t('apex.filterCommon') }}</v-btn>
      <v-btn size="x-small" :value="ApexFilterEnum.all">{{ t('apex.filterAll') }}</v-btn>
    </v-btn-toggle>
  </div>
</template>

<style scoped>
.apex-launch-filters {
  gap: 8px;
}

.apex-filter-search {
  flex: 0 1 auto;
  min-width: 120px;
  max-width: 280px;
  width: 240px;
}

/** 常用 / 全部：尽量小、颜色偏淡 */
.apex-filter-type-toggle :deep(.v-btn) {
  padding-inline: 6px !important;
  font-size: 0.6875rem !important;
  letter-spacing: 0.01em;
}

.apex-filter-type-toggle :deep(.v-btn__content) {
  padding-inline: 2px;
}
</style>
