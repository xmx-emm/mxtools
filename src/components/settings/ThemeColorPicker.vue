<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {useUiStyleStore} from '@/stores/style.ts';
import {accentThemes} from '@/themes.ts';

const { t } = useI18n();
const uiStore = useUiStyleStore();

function selectAccent(id: string, target: EventTarget | null) {
  const rect = target instanceof HTMLElement
    ? target.getBoundingClientRect()
    : null;
  void uiStore.setAccent(id, rect
    ? {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}
    : undefined);
}

function onAccentKeydown(event: KeyboardEvent, index: number) {
  if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const current = event.currentTarget;
  if (!(current instanceof HTMLElement)) return;
  const cards = Array.from(
    current.parentElement?.querySelectorAll<HTMLButtonElement>('.accent-card') ?? [],
  );
  if (!cards.length) return;

  let nextIndex = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (index + 1) % cards.length;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (index - 1 + cards.length) % cards.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = cards.length - 1;
  }

  event.preventDefault();
  const nextCard = cards[nextIndex];
  nextCard.focus({preventScroll: true});
  selectAccent(nextCard.dataset.accentId ?? '', nextCard);
}
</script>

<template>
  <div class="accent-picker">
    <div id="accent-picker-label" class="accent-picker-label text-body-2 font-weight-medium mb-3">
      {{ t('settings.accentColor') }}
    </div>
    <div
      class="accent-grid"
      role="radiogroup"
      aria-labelledby="accent-picker-label"
    >
      <button
        v-for="(theme, themeIndex) in accentThemes"
        :key="theme.id"
        type="button"
        class="accent-card"
        :data-accent-id="theme.id"
        :class="{ 'accent-card--active': uiStore.accent === theme.id }"
        role="radio"
        :aria-checked="uiStore.accent === theme.id"
        :tabindex="uiStore.accent === theme.id ? 0 : -1"
        :aria-label="t(theme.nameKey)"
        @click="selectAccent(theme.id, $event.currentTarget)"
        @keydown="onAccentKeydown($event, themeIndex)"
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
      </button>
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
  position: relative;
  width: 100%;
  padding: 10px 12px;
  overflow: hidden;
  border-radius: 8px;
  border: 1.5px solid rgba(var(--v-border-color), 0.1);
  background: rgba(var(--v-theme-surface-variant), 0.35);
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  transform: translateY(0);
  transition:
    transform var(--app-motion-fast) var(--app-ease-standard),
    border-color var(--app-motion-base) var(--app-ease-standard),
    background-color var(--app-motion-base) var(--app-ease-standard),
    box-shadow var(--app-motion-base) var(--app-ease-standard);
}

.accent-card:hover {
  border-color: rgba(var(--v-border-color), 0.25);
  background: rgba(var(--v-theme-surface-variant), 0.6);
  transform: translateY(-1px);
}

.accent-card:active {
  transform: translateY(0) scale(0.985);
}

.accent-card:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
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
  transform: translateY(0);
  transition: transform var(--app-motion-base) var(--app-ease-emphasized);
}

.accent-card:hover .palette-dot {
  transform: translateY(-1px);
}

.accent-card:hover .palette-dot:nth-child(2),
.accent-card:hover .palette-dot:nth-child(5) {
  transform: translateY(-2px);
}

.accent-card:hover .palette-dot:nth-child(3),
.accent-card:hover .palette-dot:nth-child(4) {
  transform: translateY(-3px);
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
  letter-spacing: 0;
}

.accent-check {
  flex-shrink: 0;
  animation: accent-check-in var(--app-motion-base) var(--app-ease-emphasized) both;
}

@keyframes accent-check-in {
  from {
    opacity: 0;
    transform: scale(0.68) rotate(-12deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .accent-card,
  .palette-dot,
  .accent-check {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
