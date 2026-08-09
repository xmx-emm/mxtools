<script setup lang="ts">
import type {Component, CSSProperties} from 'vue';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from 'vue';
import {useI18n} from 'vue-i18n';
import {useRoute, useRouter} from 'vue-router';
import {tools} from '@/router.ts';
import {useCommandPalette} from '@/composables/useCommandPalette.ts';
import {useSettingsStore} from '@/stores/settings.ts';

type CommandKind = 'home' | 'settings' | 'category' | 'tool' | 'subtool';

interface CommandItem {
  id: string;
  path: string;
  label: string;
  meta: string;
  kind: CommandKind;
  icon?: string;
  iconComponent?: Component;
  beta?: boolean;
  searchText: string;
  order: number;
}

interface CommandGroup {
  id: string;
  label: string;
  items: CommandItem[];
}

const router = useRouter();
const route = useRoute();
const {t} = useI18n();
const settingsStore = useSettingsStore();
const {
  isOpen,
  recentPaths,
  open,
  close,
  toggle,
  recordRecentPath,
} = useCommandPalette();

const query = ref('');
const activeIndex = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);
const returnFocusTarget = ref<HTMLElement | null>(null);
const instanceId = useId();
const titleId = `${instanceId}-title`;
const listboxId = `${instanceId}-listbox`;
const resultStatusId = `${instanceId}-status`;

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[_/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const commandItems = computed<CommandItem[]>(() => {
  let order = 0;
  const items: CommandItem[] = [];

  const addItem = (
    item: Omit<CommandItem, 'id' | 'searchText' | 'order'> & {
      aliases?: string[];
    },
  ) => {
    const aliases = item.aliases ?? [];
    items.push({
      ...item,
      id: `command-${order}`,
      order: order++,
      searchText: normalizeSearchText([
        item.label,
        item.meta,
        item.path,
        ...aliases,
      ].join(' ')),
    });
  };

  addItem({
    path: '/dashboard',
    label: t('dashboard.title'),
    meta: t('commandPalette.home'),
    kind: 'home',
    icon: 'mdi-monitor-dashboard',
    aliases: ['home', 'dashboard'],
  });

  for (const category of tools) {
    const categoryLabel = t(category.nameKey);
    addItem({
      path: category.path,
      label: categoryLabel,
      meta: t('commandPalette.category'),
      kind: 'category',
      icon: category.icon,
      aliases: [category.name, category.nameKey],
    });

    for (const child of category.children) {
      if (child.beta && !settingsStore.betaFeaturesEnabled) continue;
      addItem({
        path: child.path,
        label: t(child.nameKey),
        meta: t('commandPalette.toolInCategory', {category: categoryLabel}),
        kind: 'tool',
        icon: child.icon,
        iconComponent: child.iconComponent,
        beta: child.beta,
        aliases: [child.name, child.nameKey, category.name, categoryLabel],
      });

      for (const searchChild of child.searchChildren ?? []) {
        addItem({
          path: searchChild.path,
          label: t(searchChild.nameKey),
          meta: t('commandPalette.subtoolInTool', {tool: t(child.nameKey)}),
          kind: 'subtool',
          icon: searchChild.icon,
          iconComponent: searchChild.iconComponent,
          aliases: [
            searchChild.name,
            searchChild.nameKey,
            child.name,
            child.nameKey,
            category.name,
            categoryLabel,
          ],
        });
      }
    }
  }

  addItem({
    path: '/settings',
    label: t('settings.title'),
    meta: t('commandPalette.settings'),
    kind: 'settings',
    icon: 'mdi-cog-outline',
    aliases: ['settings', 'preferences'],
  });

  return items;
});

const commandPathSet = computed(
  () => new Set(commandItems.value.map((item) => item.path)),
);

function recentRank(path: string): number {
  const rank = recentPaths.value.indexOf(path);
  return rank === -1 ? Number.POSITIVE_INFINITY : rank;
}

function matchScore(item: CommandItem, search: string): number | null {
  const tokens = search.split(' ').filter(Boolean);
  if (!tokens.every((token) => item.searchText.includes(token))) return null;

  const label = normalizeSearchText(item.label);
  const path = normalizeSearchText(item.path);
  if (label === search) return 0;
  if (label.startsWith(search)) return 10;
  if (label.split(' ').some((word) => word.startsWith(search))) return 20;
  if (item.searchText.startsWith(search)) return 30;
  if (label.includes(search)) return 40;
  if (path.includes(search)) return 60;
  return 80;
}

const matchingItems = computed(() => {
  const search = normalizeSearchText(query.value);
  if (!search) return commandItems.value;

  return commandItems.value
    .map((item) => ({item, score: matchScore(item, search)}))
    .filter((match): match is {item: CommandItem; score: number} => match.score !== null)
    .sort((a, b) => (
      a.score - b.score ||
      recentRank(a.item.path) - recentRank(b.item.path) ||
      a.item.order - b.item.order
    ))
    .map(({item}) => item);
});

const groups = computed<CommandGroup[]>(() => {
  if (normalizeSearchText(query.value)) {
    return matchingItems.value.length
      ? [{id: 'results', label: t('commandPalette.results'), items: matchingItems.value}]
      : [];
  }

  const itemByPath = new Map(commandItems.value.map((item) => [item.path, item]));
  const recentItems = recentPaths.value
    .map((path) => itemByPath.get(path))
    .filter((item): item is CommandItem => item !== undefined);
  const recentPathSet = new Set(recentItems.map((item) => item.path));
  const allItems = commandItems.value.filter((item) => !recentPathSet.has(item.path));

  return [
    ...(recentItems.length
      ? [{id: 'recent', label: t('commandPalette.recent'), items: recentItems}]
      : []),
    ...(allItems.length
      ? [{id: 'all', label: t('commandPalette.all'), items: allItems}]
      : []),
  ];
});

const selectableItems = computed(() => groups.value.flatMap((group) => group.items));
const activeItem = computed(() => selectableItems.value[activeIndex.value]);
const activeDescendant = computed(() => (
  activeItem.value ? `${instanceId}-${activeItem.value.id}` : undefined
));
const resultStatus = computed(() => t('commandPalette.resultCount', {
  count: selectableItems.value.length,
}));

function itemIndex(path: string): number {
  return selectableItems.value.findIndex((item) => item.path === path);
}

function itemStyle(path: string): CSSProperties {
  const index = itemIndex(path);
  return {'--command-delay': `${Math.min(Math.max(index, 0), 8) * 16}ms`};
}

function focusSearch() {
  searchInput.value?.focus({preventScroll: true});
}

function captureReturnFocus() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active.closest('.command-palette')) return;
  returnFocusTarget.value = active;
}

function restoreFocus() {
  const target = returnFocusTarget.value;
  returnFocusTarget.value = null;
  if (target?.isConnected) target.focus({preventScroll: true});
}

function scrollActiveIntoView() {
  void nextTick(() => {
    if (!activeDescendant.value) return;
    document.getElementById(activeDescendant.value)?.scrollIntoView({block: 'nearest'});
  });
}

function moveSelection(delta: number) {
  const count = selectableItems.value.length;
  if (!count) return;
  activeIndex.value = (activeIndex.value + delta + count) % count;
  scrollActiveIntoView();
}

function setActive(path: string) {
  const index = itemIndex(path);
  if (index !== -1) activeIndex.value = index;
}

async function navigate(item: CommandItem | undefined) {
  if (!item) return;
  close();
  await router.push(item.path);
  if (item.kind === 'subtool') {
    recordRecentPath(item.path);
    return;
  }
  // Record the resolved route so category shortcuts follow any remembered-child redirect.
  recordRecentPath(router.currentRoute.value.path);
}

function handlePaletteKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  const isSearchInput = event.target === searchInput.value;

  if (event.key === 'ArrowDown') {
    if (!isSearchInput) return;
    event.preventDefault();
    moveSelection(1);
  } else if (event.key === 'ArrowUp') {
    if (!isSearchInput) return;
    event.preventDefault();
    moveSelection(-1);
  } else if (event.key === 'Enter') {
    if (event.target !== searchInput.value) return;
    event.preventDefault();
    void navigate(activeItem.value);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (
    event.isComposing ||
    event.altKey ||
    event.shiftKey ||
    !(event.ctrlKey || event.metaKey) ||
    event.key.toLocaleLowerCase() !== 'k'
  ) {
    return;
  }

  event.preventDefault();
  toggle();
}

function handleDialogModel(value: boolean) {
  if (value) open();
  else close();
}

watch(isOpen, (openState) => {
  if (!openState) return;
  captureReturnFocus();
  query.value = '';
  activeIndex.value = 0;
  void nextTick(focusSearch);
});

watch(query, () => {
  activeIndex.value = 0;
  scrollActiveIntoView();
});

watch(selectableItems, (items) => {
  if (!items.length) {
    activeIndex.value = 0;
  } else if (activeIndex.value >= items.length) {
    activeIndex.value = items.length - 1;
  }
});

let removeAfterEach: (() => void) | null = null;

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown, {capture: true});
  if (commandPathSet.value.has(route.path)) recordRecentPath(route.path);
  removeAfterEach = router.afterEach((to) => {
    if (commandPathSet.value.has(to.path)) recordRecentPath(to.path);
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown, {capture: true});
  removeAfterEach?.();
  restoreFocus();
});

defineExpose({open, close, toggle});
</script>

<template>
  <v-dialog
    :model-value="isOpen"
    class="command-palette-dialog"
    content-class="command-palette-dialog__content"
    transition="command-palette-transition"
    scroll-strategy="block"
    :aria-labelledby="titleId"
    aria-modal="true"
    aria-keyshortcuts="Control+K Meta+K"
    role="dialog"
    @update:model-value="handleDialogModel"
    @after-enter="focusSearch"
    @after-leave="restoreFocus"
  >
    <section class="command-palette" @keydown="handlePaletteKeydown">
      <header class="command-palette__header">
        <div class="command-palette__identity">
          <span class="command-palette__mark" aria-hidden="true">
            <v-icon icon="mdi-console" size="18"/>
          </span>
          <h2 :id="titleId" class="command-palette__title">
            {{ t('commandPalette.title') }}
          </h2>
        </div>
        <button
          type="button"
          class="command-palette__close"
          :aria-label="t('common.close')"
          :title="t('common.close')"
          @click="close"
        >
          <v-icon icon="mdi-close" size="18"/>
        </button>
      </header>

      <div class="command-palette__search mx-search-surface">
        <v-icon class="command-palette__search-icon mx-search-icon" icon="mdi-magnify" size="20" aria-hidden="true"/>
        <input
          ref="searchInput"
          v-model="query"
          class="command-palette__input"
          type="search"
          autocomplete="off"
          spellcheck="false"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          :aria-label="t('commandPalette.searchLabel')"
          :aria-controls="listboxId"
          :aria-describedby="resultStatusId"
          :aria-activedescendant="activeDescendant"
          :placeholder="t('commandPalette.searchPlaceholder')"
        />
      </div>

      <p :id="resultStatusId" class="command-palette__sr-only" aria-live="polite">
        {{ resultStatus }}
      </p>

      <div :id="listboxId" class="command-palette__results" role="listbox">
        <template v-if="groups.length">
          <section
            v-for="group in groups"
            :key="group.id"
            class="command-palette__group"
            :aria-labelledby="`${instanceId}-${group.id}-label`"
            role="group"
          >
            <div class="command-palette__group-heading">
              <h3 :id="`${instanceId}-${group.id}-label`">{{ group.label }}</h3>
              <span aria-hidden="true">{{ group.items.length }}</span>
            </div>
            <ul class="command-palette__list" role="presentation">
              <li
                v-for="item in group.items"
                :id="`${instanceId}-${item.id}`"
                :key="item.path"
                class="command-palette__item"
                :class="{
                  'command-palette__item--active': activeItem?.path === item.path,
                  'command-palette__item--current': route.path === item.path,
                }"
                :style="itemStyle(item.path)"
                role="option"
                :aria-selected="activeItem?.path === item.path"
                :aria-label="t('commandPalette.openItem', {name: item.label})"
                @mouseenter="setActive(item.path)"
                @mousedown.prevent
                @click="navigate(item)"
              >
                <span class="command-palette__item-icon" aria-hidden="true">
                  <v-icon v-if="!item.iconComponent" :icon="item.icon" size="19"/>
                  <v-icon v-else size="19">
                    <component :is="item.iconComponent"/>
                  </v-icon>
                </span>
                <span class="command-palette__item-copy">
                  <span class="command-palette__item-label">{{ item.label }}</span>
                  <span class="command-palette__item-meta">{{ item.meta }}</span>
                </span>
                <span
                  v-if="item.beta"
                  class="mx-beta-badge command-palette__item-beta"
                  :title="$t('settings.betaFeaturesHint')"
                >
                  {{ t('common.beta') }}
                </span>
                <v-icon
                  v-if="route.path === item.path"
                  class="command-palette__current-icon"
                  icon="mdi-check"
                  size="17"
                  :aria-label="t('commandPalette.currentPage')"
                />
                <v-icon
                  v-else
                  class="command-palette__open-icon"
                  icon="mdi-chevron-right"
                  size="18"
                  aria-hidden="true"
                />
              </li>
            </ul>
          </section>
        </template>

        <div v-else class="command-palette__empty" role="status">
          <span class="command-palette__empty-icon" aria-hidden="true">
            <v-icon icon="mdi-file-search-outline" size="26"/>
          </span>
          <p>{{ t('commandPalette.noResults') }}</p>
        </div>
      </div>
    </section>
  </v-dialog>
</template>

<style scoped>
.command-palette-dialog :deep(.v-overlay__scrim) {
  background: rgb(11, 14, 18) !important;
  opacity: 0.46 !important;
  backdrop-filter: blur(9px) saturate(115%);
  -webkit-backdrop-filter: blur(9px) saturate(115%);
}

.command-palette-dialog :deep(.command-palette-dialog__content) {
  box-sizing: border-box;
  width: min(650px, calc(100vw - 48px));
  max-width: none;
  margin: 24px;
}

.command-palette {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: min(570px, calc(100dvh - 64px));
  min-height: min(390px, calc(100dvh - 48px));
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.96);
  border: 1px solid rgba(var(--v-theme-primary), 0.28);
  border-radius: 8px;
  background:
    linear-gradient(155deg, rgba(var(--v-theme-primary), 0.075), transparent 31%),
    rgba(var(--v-theme-surface-bright), 0.975);
  box-shadow:
    0 28px 80px rgba(4, 7, 12, 0.36),
    0 5px 18px rgba(4, 7, 12, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.055);
  backdrop-filter: blur(24px) saturate(132%);
  -webkit-backdrop-filter: blur(24px) saturate(132%);
}

.command-palette::before {
  position: absolute;
  z-index: 3;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  content: '';
  background: linear-gradient(
    90deg,
    transparent 4%,
    rgba(var(--v-theme-primary), 0.42) 28%,
    rgb(var(--v-theme-primary)) 50%,
    rgba(var(--v-theme-primary), 0.42) 72%,
    transparent 96%
  );
  transform-origin: center;
  animation: command-palette-accent-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
  pointer-events: none;
}

.command-palette__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 54px;
  gap: 16px;
  min-width: 0;
  padding: 10px 12px 8px 16px;
}

.command-palette__identity {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.command-palette__mark,
.command-palette__empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-primary), 0.22);
  background: rgba(var(--v-theme-primary), 0.1);
}

.command-palette__mark {
  width: 30px;
  height: 30px;
  border-radius: 7px;
}

.command-palette__title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-palette__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  padding: 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  transition:
    color 150ms ease,
    background-color 150ms ease,
    transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.command-palette__close:hover {
  color: rgba(var(--v-theme-on-surface), 0.96);
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.command-palette__close:active {
  transform: scale(0.92);
}

.command-palette__search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 52px;
  margin: 0 14px 10px;
  overflow: hidden;
  border: 1px solid var(--mx-search-border);
  border-radius: var(--mx-search-radius);
  background: var(--mx-search-surface);
  transition:
    border-color var(--app-motion-fast) var(--app-ease-standard),
    box-shadow var(--app-motion-base) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard);
}

.command-palette__search:focus-within {
  border-color: var(--mx-search-border-focus);
  background: var(--mx-search-surface-hover);
  box-shadow:
    0 0 0 3px var(--mx-search-focus-ring),
    0 10px 28px rgba(var(--v-theme-primary), 0.08);
}

.command-palette__search-icon {
  flex: 0 0 auto;
  margin-inline: 15px 10px;
  color: var(--mx-search-icon);
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    transform var(--app-motion-fast) var(--app-ease-emphasized);
}

.command-palette__search:focus-within .command-palette__search-icon {
  color: rgb(var(--v-theme-primary));
  transform: scale(1.08);
}

.command-palette__input {
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0 14px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.96);
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  font-size: 15px;
  font-weight: 520;
  letter-spacing: 0;
  appearance: none;
}

.command-palette__input::placeholder {
  color: var(--mx-search-placeholder);
  opacity: 1;
}

.command-palette__input::-webkit-search-cancel-button {
  opacity: 0.6;
  cursor: pointer;
}

.command-palette__results {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 8px 10px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.command-palette__group + .command-palette__group {
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px solid var(--app-border);
}

.command-palette__group-heading {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  padding: 0 10px;
  color: rgba(var(--v-theme-on-surface), 0.64);
  background: rgba(var(--v-theme-surface-bright), 0.94);
  backdrop-filter: blur(12px);
}

.command-palette__group-heading h3,
.command-palette__group-heading span {
  margin: 0;
  font-size: 11px;
  font-weight: 680;
  line-height: 1;
  letter-spacing: 0;
}

.command-palette__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.command-palette__item {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 50px;
  gap: 11px;
  padding: 6px 11px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 7px;
  cursor: pointer;
  animation: command-palette-item-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--command-delay);
  transition:
    color 140ms ease,
    border-color 150ms ease,
    background-color 150ms ease,
    transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.command-palette__item::before {
  position: absolute;
  top: 9px;
  bottom: 9px;
  left: 0;
  width: 2px;
  border-radius: 0 2px 2px 0;
  content: '';
  background: rgb(var(--v-theme-primary));
  opacity: 0;
  transform: scaleY(0.35);
  transition: opacity 140ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.command-palette__item--active {
  border-color: rgba(var(--v-theme-primary), 0.2);
  background: rgba(var(--v-theme-primary), 0.105);
  transform: translateX(2px);
}

.command-palette__item--active::before {
  opacity: 1;
  transform: scaleY(1);
}

.command-palette__item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  color: rgba(var(--v-theme-on-surface), 0.66);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.075);
  border-radius: 7px;
  background: rgba(var(--v-theme-on-surface), 0.045);
  transition:
    color 150ms ease,
    border-color 150ms ease,
    background-color 150ms ease,
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.command-palette__item--active .command-palette__item-icon {
  color: rgb(var(--v-theme-primary));
  border-color: rgba(var(--v-theme-primary), 0.24);
  background: rgba(var(--v-theme-primary), 0.115);
  transform: scale(1.04);
}

.command-palette__item-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.command-palette__item-label,
.command-palette__item-meta {
  overflow: hidden;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-palette__item-label {
  color: rgba(var(--v-theme-on-surface), 0.91);
  font-size: 13px;
  font-weight: 620;
}

.command-palette__item-beta {
  flex: 0 0 auto;
}

.command-palette__item-meta {
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 11px;
  font-weight: 500;
}

.command-palette__open-icon,
.command-palette__current-icon {
  flex: 0 0 auto;
}

.command-palette__open-icon {
  color: rgba(var(--v-theme-on-surface), 0.28);
  opacity: 0;
  transform: translateX(-5px);
  transition: opacity 140ms ease, transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.command-palette__item--active .command-palette__open-icon {
  color: rgb(var(--v-theme-primary));
  opacity: 0.78;
  transform: translateX(0);
}

.command-palette__current-icon {
  color: rgb(var(--v-theme-primary));
}

.command-palette__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-height: 210px;
  gap: 14px;
  color: rgba(var(--v-theme-on-surface), 0.64);
  text-align: center;
}

.command-palette__empty-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
}

.command-palette__empty p {
  margin: 0;
  font-size: 13px;
  font-weight: 560;
}

.command-palette__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.command-palette-transition-enter-active,
.command-palette-transition-leave-active {
  transition:
    opacity 170ms ease,
    transform 240ms cubic-bezier(0.16, 1, 0.3, 1) !important;
  transform-origin: 50% 18%;
}

.command-palette-transition-enter-from,
.command-palette-transition-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.965);
}

@keyframes command-palette-accent-in {
  from {
    opacity: 0;
    transform: scaleX(0.18);
  }
  to {
    opacity: 1;
    transform: scaleX(1);
  }
}

@keyframes command-palette-item-in {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 560px) {
  .command-palette-dialog :deep(.command-palette-dialog__content) {
    box-sizing: border-box;
    width: calc(100vw - 20px);
    margin: 10px;
  }

  .command-palette {
    height: min(570px, calc(100dvh - 20px));
  }

  .command-palette__header {
    padding-inline: 12px 8px;
  }

  .command-palette__search {
    margin-inline: 10px;
  }

  .command-palette__results {
    padding-inline: 5px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .command-palette::before,
  .command-palette__item {
    animation: none !important;
  }

  .command-palette,
  .command-palette *,
  .command-palette-transition-enter-active,
  .command-palette-transition-leave-active {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
