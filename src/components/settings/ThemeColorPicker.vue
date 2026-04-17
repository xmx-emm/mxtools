<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {uiStyleStore} from '@/stores/style';
import {accentThemes} from '@/themes';
import {applyAccentTheme} from '@/vuetify';

const { t } = useI18n();
const uiStore = uiStyleStore();

function selectAccent(id: string) {
  uiStore.setAccent(id);
  applyAccentTheme(id);
}
</script>

<template>
  <div class="accent-picker">
    <div class="accent-picker-label text-body-2 font-weight-medium mb-3">
      {{ t('settings.accentColor') }}
    </div>
    <div class="accent-grid">
      <div
        v-for="theme in accentThemes"
        :key="theme.id"
        class="accent-card"
        :class="{ 'accent-card--active': uiStore.accent === theme.id }"
        @click="selectAccent(theme.id)"
      >
        <div class="accent-palette">
          <span
            v-for="(color, i) in theme.previewColors"
            :key="i"
            class="palette-dot"
            :style="{ background: color }"
          />
        </div>
        <div class="accent-card-footer">
          <span class="accent-name">{{ t(theme.nameKey) }}</span>
          <v-icon
            v-if="uiStore.accent === theme.id"
            class="accent-check"
            size="14"
            color="primary"
          >mdi-check-circle
          </v-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.accent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 10px;
}

.accent-card {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1.5px solid rgba(var(--v-border-color), 0.1);
  background: rgba(var(--v-theme-surface-variant), 0.35);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.accent-card:hover {
  border-color: rgba(var(--v-border-color), 0.25);
  background: rgba(var(--v-theme-surface-variant), 0.6);
}

.accent-card--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.06);
  box-shadow: 0 0 0 1px rgba(var(--v-theme-primary), 0.15);
}

.accent-card--active:hover {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}

.accent-palette {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.palette-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.08);
}

.accent-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.accent-name {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.72;
  letter-spacing: -0.01em;
}

.accent-check {
  flex-shrink: 0;
}
</style>
