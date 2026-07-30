<script setup lang="ts">
import {computed, onUnmounted, ref, watch} from 'vue';
import {ApexFilterEnum} from '@/enum.ts';
import {useApexStore} from '@/stores/game/apex.ts';
import {useI18n} from 'vue-i18n';

const { t } = useI18n();
const apex_store = useApexStore();

/** 本地输入即时响应；写入 store 防抖，避免逐字重算整表 + 同步 IPC */
const localSearch = ref(apex_store.filter_search ?? '');
let searchTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => apex_store.filter_search,
  (v) => {
    const next = v ?? '';
    if (next !== localSearch.value) {
      localSearch.value = next;
    }
  },
);

watch(localSearch, (v) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    if ((apex_store.filter_search ?? '') !== v) {
      apex_store.filter_search = v;
    }
  }, 120);
});

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

/** 有搜索内容时：类型切换禁用(搜索按「全部」范围),清空后恢复 */
const isFilterSearchActive = computed(
  () => (localSearch.value ?? '').trim().length > 0
);
</script>

<template>
  <div class="d-flex flex-row align-center flex-nowrap apex-launch-filters">

    <v-text-field
      v-model="localSearch"
      class="mx-search-field apex-filter-search"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      :placeholder="t('apex.filterSearchPlaceholder')"
      :aria-label="t('apex.filterSearchPlaceholder')"
      prepend-inner-icon="mdi-magnify"
    />
    <v-spacer/>
    <v-btn-toggle
      v-model="apex_store.filter_type"
      class="game-page-segmented-toggle"
      density="compact"
      mandatory
      color="primary"
      variant="text"
      border
      divided
      :disabled="isFilterSearchActive"
    >
      <v-btn size="x-small" :value="ApexFilterEnum.normal">{{ t('apex.filterCommon') }}</v-btn>
      <v-btn size="x-small" :value="ApexFilterEnum.all">{{ t('apex.filterAll') }}</v-btn>
    </v-btn-toggle>
  </div>
</template>

<style scoped>
.apex-launch-filters {
  gap: 8px;
  padding-bottom: 8px;
}

.apex-filter-search {
  flex: 0 1 auto;
  min-width: 120px;
  max-width: 280px;
  width: 240px;
}

</style>
