<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import type {SnapshotDetail} from '@/utils/game/apex_snapshot_details.ts';
defineProps<{title: string; modelValue: boolean; rows: SnapshotDetail[]; disabled?: boolean}>();
const emit = defineEmits<{(event: 'update:modelValue', value: boolean): void}>();
const {t} = useI18n();
</script>

<template>
  <details class="snapshot-section">
    <summary>
      <input type="checkbox" :checked="modelValue" :disabled="disabled" :aria-label="title"
        @click.stop @keydown.stop @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)">
      <span class="section-title">{{ title }}</span>
      <span class="section-count">{{ t('apex.configSnapshot.exportItemCount', {count: rows.length}) }}</span>
      <v-icon class="section-chevron" icon="mdi-chevron-down" size="18"/>
    </summary>
    <div class="section-content">
      <slot/>
      <div v-if="!rows.length" class="empty-details">{{ t('apex.configSnapshot.noDetails') }}</div>
      <table v-else>
        <thead><tr><th>{{ t('apex.configSnapshot.detailItem') }}</th><th>{{ t('apex.configSnapshot.detailValue') }}</th></tr></thead>
        <tbody><tr v-for="row in rows" :key="row.id">
          <td><span v-if="row.labelKey">{{ t(row.labelKey) }}</span><code>{{ row.key }}</code><small>{{ row.source }}</small></td>
          <td><code>{{ row.value }}</code></td>
        </tr></tbody>
      </table>
    </div>
  </details>
</template>

<style scoped>
.snapshot-section { border-bottom: 1px solid var(--app-border); }
summary { display: flex; align-items: center; gap: 12px; padding: 16px 8px; cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary:hover { background: rgba(var(--v-theme-on-surface), .035); }
summary:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
input { width: 16px; height: 16px; flex: 0 0 auto; accent-color: rgb(var(--v-theme-primary)); cursor: pointer; }
.section-title { flex: 1; font-size: 13px; font-weight: 600; }
.section-count { font-size: 12px; color: rgba(var(--v-theme-on-surface), .55); }
details[open] > summary .section-chevron { transform: rotate(180deg); }
.section-content { padding: 0 8px 16px 36px; }
table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; }
th { text-align: left; font-weight: 500; color: rgba(var(--v-theme-on-surface), .55); }
th, td { padding: 4px 10px; border-bottom: 1px solid var(--app-border); vertical-align: top; line-height: 1.3; }
th:first-child { width: 58%; }
code, small { display: block; white-space: pre-wrap; overflow-wrap: anywhere; }
small { margin-top: 1px; color: rgba(var(--v-theme-on-surface), .5); font-size: 10px; }
.empty-details { padding: 12px; font-size: 12px; color: rgba(var(--v-theme-on-surface), .55); }
</style>
