<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import type {InputMethodItem} from '@/types/inputMethod.ts';
import {
  disableChsSimplifiedTraditionalHotkey,
  openInputMethodSettings,
  removeInputMethod,
  reorderInputMethods,
} from '@/ipc/commands.ts';
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

const {t, locale} = useI18n();
const toast = useToast();

async function withSaving(fn: () => Promise<void>) {
  if (props.saving) return;
  emit('update:saving', true);
  try {
    await fn();
  } finally {
    emit('update:saving', false);
  }
}

async function reorder(ids: string[]) {
  await withSaving(async () => {
    try {
      await reorderInputMethods({ids});
      emit('refresh');
      toast.success(t('inputMethod.toastOrderSaved'));
      toast.info(t('inputMethod.restartHint'));
    } catch (e: unknown) {
      toast.error(String(e));
    }
  });
}

function moveUp(index: number) {
  if (index <= 0) return;
  const ids = props.items.map((x) => x.id);
  [ids[index], ids[index - 1]] = [ids[index - 1], ids[index]];
  void reorder(ids);
}

function moveDown(index: number) {
  if (index >= props.items.length - 1) return;
  const ids = props.items.map((x) => x.id);
  [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
  void reorder(ids);
}

async function removeItem(item: InputMethodItem) {
  if (props.items.length <= 1) {
    toast.error(t('inputMethod.errors.cannotRemoveLast'));
    return;
  }
  const name = inputMethodDisplayName(item, locale.value);
  if (!window.confirm(t('inputMethod.removeConfirm', {name}))) return;

  await withSaving(async () => {
    try {
      await removeInputMethod({id: item.id, tip: item.input_method_tip ?? null});
      emit('refresh');
      toast.success(t('inputMethod.toastRemoved'));
      toast.info(t('inputMethod.restartHint'));
    } catch (e: unknown) {
      toast.error(String(e));
    }
  });
}

async function openSettings(item: InputMethodItem) {
  try {
    await openInputMethodSettings({id: item.id, name: item.name});
  } catch (e: unknown) {
    toast.error(String(e));
  }
}

async function disableSimplifiedTraditionalHotkey() {
  await withSaving(async () => {
    try {
      await disableChsSimplifiedTraditionalHotkey();
      toast.success(t('inputMethod.quickActions.disableHotkeyDone'));
    } catch (e: unknown) {
      toast.error(String(e));
    }
  });
}
</script>

<template>
  <section class="app-section input-method-section">
    <header class="app-section__header">
      <div>
        <h2 class="app-section__title">{{ t('inputMethod.cardTitle') }}</h2>
        <p class="app-section__subtitle">{{ t('inputMethod.cardSubtitle') }}</p>
      </div>
      <v-chip size="x-small" variant="tonal">{{ items.length }}</v-chip>
    </header>
    <v-progress-linear v-if="loading" indeterminate color="primary"/>
    <div v-else class="enabled-list">
      <article v-for="(item, index) in items" :key="item.id" class="input-method-row">
        <span class="order-num">{{ index + 1 }}</span>
        <div class="input-method-identity">
          <div class="input-method-name-line">
            <strong>{{ inputMethodDisplayName(item, locale) }}</strong>
            <span v-if="index === 0" class="default-badge">
              {{ t('inputMethod.defaultBadge') }}
            </span>
          </div>
          <span class="input-method-kind">{{ t(inputMethodKindKey(item)) }}</span>
        </div>
        <div class="input-method-actions">
          <v-btn
            v-if="item.capabilities.is_microsoft_pinyin || item.capabilities.is_microsoft_wubi"
            size="small"
            variant="tonal"
            rounded="lg"
            prepend-icon="mdi-swap-horizontal"
            :loading="saving"
            :disabled="saving"
            @click="disableSimplifiedTraditionalHotkey"
          >
            {{ t('inputMethod.quickActions.disableHotkeyShort') }}
          </v-btn>
          <v-btn
            v-if="item.capabilities.can_open_settings"
            icon
            size="small"
            variant="text"
            :disabled="saving"
            :title="t('inputMethod.openSettings')"
            @click="openSettings(item)"
          >
            <v-icon size="small">mdi-cog</v-icon>
          </v-btn>
          <v-btn
            icon
            size="small"
            variant="text"
            :disabled="index === 0 || saving || !item.capabilities.can_reorder"
            :title="t('inputMethod.moveUp')"
            @click="moveUp(index)"
          >
            <v-icon size="small">mdi-chevron-up</v-icon>
          </v-btn>
          <v-btn
            icon
            size="small"
            variant="text"
            :disabled="index === items.length - 1 || saving || !item.capabilities.can_reorder"
            :title="t('inputMethod.moveDown')"
            @click="moveDown(index)"
          >
            <v-icon size="small">mdi-chevron-down</v-icon>
          </v-btn>
          <v-btn
            icon
            size="small"
            variant="text"
            color="error"
            :disabled="saving || !item.capabilities.can_remove || items.length <= 1"
            :title="items.length <= 1 ? t('inputMethod.errors.cannotRemoveLast') : t('inputMethod.remove')"
            @click="removeItem(item)"
          >
            <v-icon size="small">mdi-delete</v-icon>
          </v-btn>
        </div>
      </article>
      <div v-if="items.length === 0" class="input-method-empty">
        <v-icon icon="mdi-keyboard-off-outline" size="28"/>
        <p>{{ t('inputMethod.empty') }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.input-method-section { overflow: hidden; }
.enabled-list { padding: 0 10px 10px; }
.input-method-row {
  display: flex;
  align-items: center;
  min-height: 62px;
  gap: 12px;
  padding: 9px 10px;
  border-radius: 12px;
}
.input-method-row + .input-method-row {
  border-top: 1px solid rgba(var(--v-border-color), 0.075);
  border-radius: 0;
}
.input-method-row:hover { background: rgba(var(--v-theme-on-surface), 0.025); }
.order-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border-radius: 8px;
  color: rgba(var(--v-theme-on-surface), 0.48);
  background: var(--app-layer-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  font-weight: 680;
}
.input-method-identity {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  gap: 3px;
}
.input-method-name-line { display: flex; align-items: center; min-width: 0; gap: 7px; }
.input-method-name-line strong {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 12px;
  font-weight: 640;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.default-badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
  font-size: 8px;
  font-weight: 700;
}
.input-method-kind { color: rgba(var(--v-theme-on-surface), 0.45); font-size: 9px; }
.input-method-actions { display: flex; align-items: center; flex: 0 0 auto; gap: 2px; }
.input-method-actions :deep(.v-btn--icon) { width: 30px; height: 30px; }
.input-method-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-height: 130px;
  gap: 8px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  text-align: center;
}
.input-method-empty p { max-width: 440px; margin: 0; font-size: 11px; line-height: 1.5; }
@media (max-width: 760px) {
  .input-method-row { align-items: flex-start; flex-wrap: wrap; }
  .input-method-actions { width: 100%; padding-left: 38px; }
}
</style>
