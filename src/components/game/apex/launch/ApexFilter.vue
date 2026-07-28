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
      class="apex-filter-type-toggle"
      density="compact"
      mandatory
      variant="text"
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

/** 常用 / 全部：次级控件，仅文字区分选中态，不用与主标签相同的 tonal 底色 */
.apex-filter-type-toggle {
  box-sizing: border-box;
  height: 30px !important;
  padding: 2px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  border-radius: var(--app-radius-sm);
  background: rgba(var(--v-theme-on-surface), 0.045);
}

.apex-filter-type-toggle :deep(.v-btn) {
  padding-inline: 6px !important;
  min-height: 26px !important;
  height: 26px !important;
  font-size: 0.6875rem !important;
  letter-spacing: 0.01em;
  color: rgba(var(--v-theme-on-surface), 0.62) !important;
  border-radius: 4px !important;
  background: transparent !important;
}

.apex-filter-type-toggle :deep(.v-btn--active) {
  color: rgb(var(--v-theme-on-primary-container)) !important;
  background: rgb(var(--v-theme-primary-container)) !important;
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.2);
}

.apex-filter-type-toggle :deep(.v-btn--active > .v-btn__overlay) {
  opacity: 0 !important;
}

.apex-filter-type-toggle :deep(.v-btn:hover:not(.v-btn--active)) {
  color: rgba(var(--v-theme-on-surface), 0.9) !important;
  background: rgba(var(--v-theme-on-surface), 0.06) !important;
}

.apex-filter-type-toggle :deep(.v-btn:focus-visible) {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}

.apex-filter-type-toggle :deep(.v-btn__content) {
  padding-inline: 2px;
}
</style>
