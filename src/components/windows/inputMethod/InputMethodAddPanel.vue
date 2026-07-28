<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import type {InputMethodItem} from '@/types/inputMethod.ts';
import {addInputMethod} from '@/ipc/commands.ts';
import {inputMethodDisplayName, inputMethodKindKey} from '@/utils/input-method-display.ts';

const props = defineProps<{
  items: InputMethodItem[];
  loading: boolean;
  saving: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
  'update:saving': [value: boolean];
}>();

const COLLAPSED_VISIBLE = 5;
const {t, locale} = useI18n();
const toast = useToast();
const expanded = ref(false);
const needsCollapse = computed(() => props.items.length > COLLAPSED_VISIBLE);
const visibleItems = computed(() =>
  needsCollapse.value && !expanded.value ? props.items.slice(0, COLLAPSED_VISIBLE) : props.items,
);

watch(() => props.items.length, () => {
  if (!needsCollapse.value) expanded.value = false;
});

async function addItem(id: string) {
  if (props.saving) return;
  emit('update:saving', true);
  try {
    await addInputMethod({id});
    emit('refresh');
    toast.success(t('inputMethod.toastAdded'));
    toast.info(t('inputMethod.restartHint'));
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    emit('update:saving', false);
  }
}
</script>

<template>
  <section class="app-section input-method-section">
    <header class="app-section__header">
      <div>
        <h2 class="app-section__title">{{ t('inputMethod.addPanel.title') }}</h2>
        <p class="app-section__subtitle">{{ t('inputMethod.addPanel.subtitle') }}</p>
      </div>
      <v-chip size="x-small" variant="tonal">{{ items.length }}</v-chip>
    </header>
    <v-progress-linear v-if="loading" indeterminate color="primary"/>
    <div v-else-if="items.length === 0" class="input-method-empty">
      {{ t('inputMethod.addPanel.empty') }}
    </div>
    <template v-else>
      <div class="add-list">
        <article v-for="item in visibleItems" :key="item.id" class="add-row">
          <span class="add-row-icon"><v-icon icon="mdi-keyboard-plus-outline" size="17"/></span>
          <div class="add-row-copy">
            <strong>{{ inputMethodDisplayName(item, locale) }}</strong>
            <span>{{ t(inputMethodKindKey(item)) }}</span>
          </div>
          <v-btn size="small" variant="tonal" rounded="lg" :disabled="saving" @click="addItem(item.id)">
            {{ t('inputMethod.addPanel.add') }}
          </v-btn>
        </article>
      </div>
      <div v-if="needsCollapse" class="add-list-toggle">
        <v-btn
          size="small"
          variant="text"
          rounded="lg"
          :append-icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          @click="expanded = !expanded"
        >
          {{ expanded
            ? t('inputMethod.addPanel.collapse')
            : t('inputMethod.addPanel.expand', {count: items.length}) }}
        </v-btn>
      </div>
    </template>
  </section>
</template>

<style scoped>
.input-method-section { overflow: hidden; }
.add-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 0 12px 12px;
}
.add-row {
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 54px;
  gap: 10px;
  padding: 8px 9px;
  border: 1px solid rgba(var(--v-border-color), 0.075);
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.018);
}
.add-row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 9px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.085);
}
.add-row-copy { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; gap: 2px; }
.add-row-copy strong {
  overflow: hidden;
  font-size: 11px;
  font-weight: 630;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.add-row-copy span { color: rgba(var(--v-theme-on-surface), 0.43); font-size: 9px; }
.add-list-toggle { display: flex; justify-content: center; padding: 0 12px 10px; }
.input-method-empty {
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.45);
  font-size: 11px;
  text-align: center;
}
@media (max-width: 760px) { .add-list { grid-template-columns: 1fr; } }
</style>
