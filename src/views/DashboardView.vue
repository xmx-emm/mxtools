<script setup lang="ts">
import {computed} from 'vue';
import type {Component} from 'vue';
import {useI18n} from 'vue-i18n';
import {tools} from '@/router.ts';
import {useSettingsStore} from '@/stores/settings.ts';
import {useCommandPalette} from '@/composables/useCommandPalette.ts';

interface DashboardTool {
  path: string;
  nameKey: string;
  categoryPath: string;
  categoryNameKey: string;
  icon?: string;
  iconComponent?: Component;
  descriptionKey?: string;
  beta?: boolean;
}

interface ResumeTool extends DashboardTool {
  to: string;
}

const TOOL_DESCRIPTION_KEYS: Partial<Record<string, string>> = {
  '/game_optimizer': 'gameOptimizer.subtitle',
  '/apex': 'game.apexDescription',
  '/pubg': 'game.pubgDescription',
  '/folder_sharing': 'folderSharing.subtitle',
  '/explorer': 'explorer.commonFoldersSubtitle',
  '/remote_desktop': 'rdp.status.subtitle',
  '/input_method': 'inputMethod.description',
  '/port_forwarding': 'portForwarding.description',
};

const {t} = useI18n();
const settings = useSettingsStore();
const {open: openCommandPalette} = useCommandPalette();

const toolGroups = computed(() => tools.map((category) => ({
  ...category,
  children: category.children
    .filter(child => !child.beta || settings.betaFeaturesEnabled)
    .map<DashboardTool>((child) => ({
      path: child.path,
      nameKey: child.nameKey,
      categoryPath: category.path,
      categoryNameKey: category.nameKey,
      icon: child.icon,
      iconComponent: child.iconComponent,
      descriptionKey: TOOL_DESCRIPTION_KEYS[child.path],
      beta: child.beta,
    })),
})));

const allTools = computed(() => toolGroups.value.flatMap((group) => group.children));

function pathOnly(path: string): string {
  return path.trim().split(/[?#]/)[0] ?? '';
}

function findTool(path: string): DashboardTool | undefined {
  const normalized = pathOnly(path);
  if (!normalized) return undefined;
  return allTools.value.find((tool) => (
    normalized === tool.path
  ));
}

const recentTools = computed<ResumeTool[]>(() => {
  const candidates: Array<{path: string; preserveRoute?: boolean}> = [];
  const lastRoute = settings.lastRoute.trim();
  const lastRoutePath = pathOnly(lastRoute);
  const lastRouteTool = findTool(lastRoute);

  if (lastRouteTool) {
    candidates.push({path: lastRoute, preserveRoute: true});
  } else {
    const lastCategory = tools.find((category) => category.path === lastRoutePath);
    const rememberedChild = lastCategory
      ? settings.lastToolCategoryChild[lastCategory.path]
      : undefined;
    if (rememberedChild) candidates.push({path: rememberedChild});
  }

  for (const category of tools) {
    const rememberedChild = settings.lastToolCategoryChild[category.path];
    if (rememberedChild) candidates.push({path: rememberedChild});
  }

  const resolved: ResumeTool[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const tool = findTool(candidate.path);
    if (!tool || seen.has(tool.path)) continue;
    seen.add(tool.path);
    resolved.push({
      ...tool,
      to: candidate.preserveRoute ? candidate.path : tool.path,
    });
  }
  return resolved.slice(0, 3);
});

const primaryResumeTool = computed<ResumeTool>(() => (
  recentTools.value[0] ?? {...allTools.value[0], to: allTools.value[0].path}
));
</script>

<template>
  <main class="dashboard" :aria-label="t('dashboard.title')">
    <div class="dashboard__scroll">
      <div class="dashboard__content">
        <header class="workspace-bar">
          <div class="brand-lockup">
            <span class="brand-lockup__mark" aria-hidden="true">
              <v-icon icon="mdi-toolbox-outline" size="21"/>
            </span>
            <div class="brand-lockup__copy">
              <h1>{{ t('dashboard.introTitle') }}</h1>
              <p>{{ t('dashboard.introTagline') }}</p>
            </div>
          </div>

          <div class="workspace-bar__actions">
            <div class="resume-cluster" :aria-label="t('dashboard.quickAccess')">
              <span class="resume-cluster__label">{{ t('dashboard.quickAccess') }}</span>
              <RouterLink
                :to="primaryResumeTool.to"
                class="resume-link resume-link--primary"
                :aria-label="`${t('dashboard.quickAccess')}: ${t(primaryResumeTool.nameKey)}`"
              >
                <span class="resume-link__icon" aria-hidden="true">
                  <v-icon v-if="primaryResumeTool.icon" :icon="primaryResumeTool.icon" size="18"/>
                  <component
                    :is="primaryResumeTool.iconComponent"
                    v-else-if="primaryResumeTool.iconComponent"
                    :size="18"
                  />
                </span>
                <span class="resume-link__copy">
                  <strong>{{ t(primaryResumeTool.nameKey) }}</strong>
                  <small>{{ t(primaryResumeTool.categoryNameKey) }}</small>
                </span>
                <v-icon class="resume-link__arrow" icon="mdi-chevron-right" size="17" aria-hidden="true"/>
              </RouterLink>

              <div v-if="recentTools.length > 1" class="resume-cluster__more">
                <RouterLink
                  v-for="item in recentTools.slice(1)"
                  :key="item.path"
                  :to="item.to"
                  class="resume-link resume-link--compact"
                  :aria-label="`${t('dashboard.quickAccess')}: ${t(item.nameKey)}`"
                  :title="t(item.nameKey)"
                >
                  <v-icon v-if="item.icon" :icon="item.icon" size="16" aria-hidden="true"/>
                  <component
                    :is="item.iconComponent"
                    v-else-if="item.iconComponent"
                    :size="16"
                    aria-hidden="true"
                  />
                  <span>{{ t(item.nameKey) }}</span>
                </RouterLink>
              </div>
            </div>

            <button
              type="button"
              class="command-trigger mx-search-trigger"
              :aria-label="t('commandPalette.searchLabel')"
              aria-keyshortcuts="Control+K Meta+K"
              @click="openCommandPalette"
            >
              <v-icon icon="mdi-magnify" size="20" aria-hidden="true"/>
              <span>{{ t('commandPalette.searchPlaceholder') }}</span>
              <kbd aria-hidden="true">Ctrl K</kbd>
            </button>
          </div>
        </header>

        <section class="tool-index" :aria-labelledby="'dashboard-tools-title'">
          <div class="tool-index__heading">
            <div>
              <h2 id="dashboard-tools-title">{{ t('dashboard.utilities') }}</h2>
              <p>{{ t('dashboard.subtitle') }}</p>
            </div>
            <span class="tool-index__count" aria-hidden="true">{{ allTools.length }}</span>
          </div>

          <div class="tool-grid">
            <section
              v-for="(group, groupIndex) in toolGroups"
              :key="group.path"
              class="tool-group"
              :style="{animationDelay: `${70 + groupIndex * 65}ms`}"
              :aria-labelledby="`tool-group-${groupIndex}`"
            >
              <RouterLink :to="group.path" class="tool-group__header">
                <span class="tool-group__icon" aria-hidden="true">
                  <v-icon :icon="group.icon" size="19"/>
                </span>
                <h3 :id="`tool-group-${groupIndex}`">{{ t(group.nameKey) }}</h3>
                <span class="tool-group__number" aria-hidden="true">0{{ group.children.length }}</span>
                <v-icon class="tool-group__arrow" icon="mdi-chevron-right" size="17" aria-hidden="true"/>
              </RouterLink>

              <div class="tool-group__list">
                <RouterLink
                  v-for="(item, itemIndex) in group.children"
                  :key="item.path"
                  :to="item.path"
                  class="tool-row"
                  :style="{animationDelay: `${135 + groupIndex * 65 + itemIndex * 40}ms`}"
                >
                  <span class="tool-row__icon" aria-hidden="true">
                    <v-icon v-if="item.icon" :icon="item.icon" size="19"/>
                    <component
                      :is="item.iconComponent"
                      v-else-if="item.iconComponent"
                      :size="19"
                    />
                  </span>
                  <span class="tool-row__copy">
                    <strong>{{ t(item.nameKey) }}</strong>
                    <small v-if="item.descriptionKey">{{ t(item.descriptionKey) }}</small>
                  </span>
                  <span
                    v-if="item.beta"
                    class="mx-beta-badge tool-row__beta"
                    :title="t('settings.betaFeaturesHint')"
                  >{{ t('common.beta') }}</span>
                  <v-icon class="tool-row__arrow" icon="mdi-chevron-right" size="17" aria-hidden="true"/>
                </RouterLink>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
.dashboard {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  background:
    linear-gradient(180deg, rgba(var(--v-theme-primary), 0.045), transparent 190px),
    rgb(var(--v-theme-background));
}

.dashboard__scroll {
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.dashboard__content {
  box-sizing: border-box;
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: clamp(16px, 2.7vw, 30px);
}

.workspace-bar {
  position: relative;
  display: grid;
  grid-template-columns: minmax(160px, 0.72fr) minmax(0, 1.6fr);
  align-items: center;
  gap: 24px;
  min-height: 96px;
  padding: 17px 18px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.76);
  box-shadow:
    inset 0 1px rgba(255, 255, 255, 0.04),
    0 12px 32px rgba(8, 18, 27, 0.05);
  backdrop-filter: blur(15px);
  animation: dashboard-enter 420ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
}

.workspace-bar::before {
  position: absolute;
  top: -1px;
  left: 18px;
  width: 112px;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgb(var(--v-theme-primary)), transparent);
  content: '';
  opacity: 0.75;
}

.brand-lockup {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 12px;
}

.brand-lockup__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  color: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-primary), 0.28);
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.09);
  box-shadow: inset 0 0 16px rgba(var(--v-theme-primary), 0.06);
}

.brand-lockup__copy {
  min-width: 0;
}

.brand-lockup h1,
.brand-lockup p,
.tool-index h2,
.tool-index p,
.tool-group h3 {
  margin: 0;
  letter-spacing: 0;
}

.brand-lockup h1 {
  overflow: hidden;
  font-size: 17px;
  font-weight: 720;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-lockup p {
  margin-top: 3px;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-bar__actions {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(170px, 0.86fr);
  align-items: end;
  min-width: 0;
  gap: 12px;
}

.resume-cluster {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-width: 0;
  gap: 5px 6px;
}

.resume-cluster__label {
  grid-column: 1 / -1;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 10px;
  font-weight: 680;
  line-height: 1;
  letter-spacing: 0;
}

.resume-link {
  color: inherit;
  text-decoration: none;
}

.resume-link--primary {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 48px;
  gap: 9px;
  padding: 6px 9px;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-primary), 0.22);
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.07);
  transition:
    border-color 180ms ease,
    background-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.resume-link--primary::after {
  position: absolute;
  right: 9px;
  bottom: 2px;
  left: 9px;
  height: 1px;
  background: linear-gradient(90deg, rgb(var(--v-theme-primary)), transparent 72%);
  content: '';
  opacity: 0;
  transform: scaleX(0);
  transform-origin: left;
  transition: opacity 150ms ease, transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}

.resume-link--primary:is(:hover, :focus-visible) {
  border-color: rgba(var(--v-theme-primary), 0.42);
  background: rgba(var(--v-theme-primary), 0.11);
  box-shadow: 0 8px 22px rgba(var(--v-theme-primary), 0.08);
  transform: translateY(-1px);
}

.resume-link--primary:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.66);
  box-shadow:
    0 0 0 2px rgba(var(--v-theme-primary), 0.18),
    0 8px 22px rgba(var(--v-theme-primary), 0.08);
}

.resume-link--primary:is(:hover, :focus-visible)::after {
  opacity: 0.75;
  transform: scaleX(1);
}

.resume-link--primary:active {
  box-shadow: 0 2px 8px rgba(var(--v-theme-primary), 0.08);
  transform: translateY(1px) scale(0.988);
  transition-duration: 70ms;
}

.resume-link__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  color: rgb(var(--v-theme-primary));
  border-radius: 7px;
  background: rgba(var(--v-theme-primary), 0.1);
  transition: background-color 170ms ease, transform 210ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.resume-link--primary:is(:hover, :focus-visible) .resume-link__icon {
  background: rgba(var(--v-theme-primary), 0.15);
  transform: translateY(-1px) scale(1.055);
}

.resume-link--primary:active .resume-link__icon {
  transform: scale(0.96);
}

.resume-link__copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.resume-link__copy strong,
.resume-link__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resume-link__copy strong {
  font-size: 12px;
  font-weight: 680;
  line-height: 1.35;
}

.resume-link__copy small {
  margin-top: 2px;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 10px;
  line-height: 1.25;
}

.resume-link__arrow,
.tool-group__arrow,
.tool-row__arrow {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.34);
  transition: color 160ms ease, transform 180ms ease;
}

.resume-link--primary:is(:hover, :focus-visible) .resume-link__arrow,
.tool-group__header:is(:hover, :focus-visible) .tool-group__arrow,
.tool-row:is(:hover, :focus-visible) .tool-row__arrow {
  color: rgb(var(--v-theme-primary));
  transform: translateX(2px);
}

.resume-cluster__more {
  display: flex;
  align-items: stretch;
  max-width: 140px;
  gap: 4px;
}

.resume-link--compact {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  gap: 5px;
  padding: 0 8px;
  color: rgba(var(--v-theme-on-surface), 0.64);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.52);
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.resume-link--compact span {
  display: none;
}

.resume-link--compact:is(:hover, :focus-visible) {
  color: rgb(var(--v-theme-primary));
  border-color: rgba(var(--v-theme-primary), 0.3);
  background: rgba(var(--v-theme-primary), 0.07);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.08);
  transform: translateY(-1px);
}

.resume-link--compact:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.62);
}

.resume-link--compact:active {
  transform: translateY(1px) scale(0.96);
  transition-duration: 70ms;
}

.command-trigger {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: 48px;
  gap: 9px;
  padding: 0 8px 0 12px;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font: inherit;
  border: 1px solid var(--mx-search-border);
  border-radius: var(--mx-search-radius);
  background: var(--mx-search-surface);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition:
    color 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.command-trigger::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -54%;
  width: 42%;
  background: linear-gradient(
    105deg,
    transparent,
    rgba(var(--v-theme-primary), 0.16),
    transparent
  );
  content: '';
  opacity: 0;
  transform: skewX(-12deg);
  transition: left 480ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 120ms ease;
  pointer-events: none;
}

.command-trigger > * {
  position: relative;
  z-index: 1;
}

.command-trigger > span {
  flex: 1 1 auto;
  overflow: hidden;
  font-size: 12px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-trigger kbd {
  flex: 0 0 auto;
  padding: 3px 6px;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-family: inherit;
  font-size: 9px;
  line-height: 1.3;
  border: 1px solid var(--app-border);
  border-radius: 5px;
  background: rgba(var(--v-theme-on-surface), 0.045);
  box-shadow: 0 1px rgba(var(--v-theme-on-surface), 0.08);
}

.command-trigger:is(:hover, :focus-visible) {
  color: rgb(var(--v-theme-on-surface));
  border-color: var(--mx-search-border-focus);
  background: var(--mx-search-surface-hover);
  box-shadow: 0 9px 25px rgba(var(--v-theme-primary), 0.09);
  transform: translateY(-1px);
}

.command-trigger:is(:hover, :focus-visible)::after {
  left: 112%;
  opacity: 1;
}

.command-trigger:focus-visible {
  border-color: var(--mx-search-border-focus);
  box-shadow:
    0 0 0 3px var(--mx-search-focus-ring),
    0 9px 25px rgba(var(--v-theme-primary), 0.09);
}

.command-trigger > .v-icon,
.command-trigger kbd {
  transition: color 170ms ease, border-color 170ms ease, transform 210ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.command-trigger:is(:hover, :focus-visible) > .v-icon {
  color: rgb(var(--v-theme-primary));
  transform: rotate(-7deg) scale(1.08);
}

.command-trigger:is(:hover, :focus-visible) kbd {
  color: rgb(var(--v-theme-primary));
  border-color: rgba(var(--v-theme-primary), 0.3);
  transform: translateY(-1px);
}

.command-trigger:active {
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.04);
  transform: translateY(1px) scale(0.988);
  transition-duration: 70ms;
}

.command-trigger:active > .v-icon,
.command-trigger:active kbd {
  transform: scale(0.95);
}

.tool-index {
  margin-top: clamp(20px, 3vw, 30px);
}

.tool-index__heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
  padding: 0 2px;
  animation: dashboard-enter 420ms 55ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
}

.tool-index h2 {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
}

.tool-index__heading p {
  margin-top: 4px;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 11px;
  line-height: 1.45;
}

.tool-index__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 27px;
  height: 22px;
  padding: 0 6px;
  color: rgb(var(--v-theme-primary));
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  border: 1px solid rgba(var(--v-theme-primary), 0.22);
  border-radius: 7px;
  background: rgba(var(--v-theme-primary), 0.07);
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: start;
  gap: 12px;
}

.tool-group {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.69);
  box-shadow: 0 8px 28px rgba(8, 18, 27, 0.035);
  animation: dashboard-enter 440ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
  transition: border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease;
}

.tool-group::before {
  position: absolute;
  z-index: 3;
  top: -1px;
  left: -28%;
  width: 38%;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgb(var(--v-theme-primary)), transparent);
  content: '';
  opacity: 0;
  transform: translateX(-120%);
  transition:
    opacity 100ms ease,
    transform 520ms cubic-bezier(0.2, 0.75, 0.2, 1);
  pointer-events: none;
}

.tool-group:is(:hover, :focus-within) {
  border-color: rgba(var(--v-theme-primary), 0.22);
  box-shadow: 0 13px 34px rgba(8, 18, 27, 0.065);
}

.tool-group:hover {
  transform: translateY(-2px);
}

.tool-group:is(:hover, :focus-within)::before {
  opacity: 0.9;
  transform: translateX(420%);
}

.tool-group__header {
  display: flex;
  align-items: center;
  min-height: 48px;
  gap: 9px;
  padding: 8px 10px;
  color: inherit;
  border-bottom: 1px solid var(--app-border);
  text-decoration: none;
  transition: background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.tool-group__header:is(:hover, :focus-visible) {
  background: rgba(var(--v-theme-primary), 0.055);
}

.tool-group__header:focus-visible {
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.5);
}

.tool-group__header:active {
  background: rgba(var(--v-theme-primary), 0.1);
  transform: translateY(1px);
  transition-duration: 70ms;
}

.tool-group__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  color: rgb(var(--v-theme-primary));
  border-radius: 7px;
  background: rgba(var(--v-theme-primary), 0.09);
  transition: background-color 170ms ease, transform 210ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.tool-group__header:is(:hover, :focus-visible) .tool-group__icon {
  background: rgba(var(--v-theme-primary), 0.14);
  transform: translateY(-1px) rotate(-4deg) scale(1.055);
}

.tool-group__header:active .tool-group__icon {
  transform: scale(0.96);
}

.tool-group h3 {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-group__number {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.tool-group__list {
  padding: 5px;
}

.tool-row {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 64px;
  gap: 10px;
  padding: 8px;
  overflow: hidden;
  color: inherit;
  border: 1px solid transparent;
  border-radius: 7px;
  text-decoration: none;
  animation: tool-row-enter 360ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
  transition:
    border-color 170ms ease,
    background-color 170ms ease,
    box-shadow 170ms ease,
    transform 180ms ease;
}

.tool-row::before {
  position: absolute;
  right: 8px;
  bottom: 2px;
  left: 8px;
  height: 1px;
  background: linear-gradient(90deg, rgb(var(--v-theme-primary)), transparent 74%);
  content: '';
  opacity: 0;
  transform: scaleX(0);
  transform-origin: left;
  transition: opacity 140ms ease, transform 310ms cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}

.tool-row + .tool-row {
  margin-top: 2px;
}

.tool-row:is(:hover, :focus-visible) {
  border-color: rgba(var(--v-theme-primary), 0.14);
  background: rgba(var(--v-theme-primary), 0.055);
}

.tool-row:hover {
  transform: translateX(2px);
}

.tool-row:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.48);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.12);
}

.tool-row:is(:hover, :focus-visible)::before {
  opacity: 0.72;
  transform: scaleX(1);
}

.tool-row:active {
  background: rgba(var(--v-theme-primary), 0.1);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.16);
  transform: translateX(1px) scale(0.988);
  transition-duration: 70ms;
}

.tool-row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 33px;
  width: 33px;
  height: 33px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  border: 1px solid rgba(var(--v-border-color), 0.075);
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.035);
  transition:
    color 170ms ease,
    border-color 170ms ease,
    background-color 170ms ease,
    transform 210ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.tool-row:is(:hover, :focus-visible) .tool-row__icon {
  color: rgb(var(--v-theme-primary));
  border-color: rgba(var(--v-theme-primary), 0.22);
  background: rgba(var(--v-theme-primary), 0.08);
  transform: translateY(-1px) scale(1.055);
}

.tool-row:active .tool-row__icon {
  transform: scale(0.96);
}

.tool-row__copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.tool-row__beta {
  flex: 0 0 auto;
}

.tool-row__copy strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-row__copy small {
  display: -webkit-box;
  margin-top: 3px;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 10px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@keyframes dashboard-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes tool-row-enter {
  from {
    opacity: 0;
    transform: translateX(-5px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (max-width: 960px) {
  .workspace-bar {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .workspace-bar__actions {
    grid-template-columns: minmax(250px, 1.15fr) minmax(210px, 0.85fr);
  }

  .tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .dashboard__content {
    padding: 14px;
  }

  .workspace-bar {
    min-height: 0;
    padding: 14px;
  }

  .workspace-bar__actions {
    grid-template-columns: 1fr;
  }

  .command-trigger {
    grid-row: 1;
  }

  .resume-cluster {
    grid-row: 2;
  }

  .tool-index {
    margin-top: 20px;
  }

  .tool-grid {
    grid-template-columns: 1fr;
  }

  .tool-row {
    min-height: 58px;
  }
}

@media (max-width: 430px) {
  .brand-lockup p {
    white-space: normal;
  }

  .resume-cluster {
    grid-template-columns: 1fr;
  }

  .resume-cluster__more {
    max-width: none;
    min-height: 34px;
  }

  .resume-link--compact {
    flex: 1 1 0;
  }

  .resume-link--compact span {
    display: block;
    overflow: hidden;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* The main window has a 980px minimum, but two resizable navigation panels
 * can leave a much narrower workspace. Container queries follow that real
 * content width instead of the outer window viewport. */
@container workspace (max-width: 820px) {
  .workspace-bar {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .workspace-bar__actions {
    grid-template-columns: minmax(220px, 1.15fr) minmax(190px, 0.85fr);
  }

  .tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container workspace (max-width: 620px) {
  .dashboard__content {
    padding: 14px;
  }

  .workspace-bar {
    min-height: 0;
    padding: 14px;
  }

  .workspace-bar__actions,
  .tool-grid {
    grid-template-columns: 1fr;
  }

  .command-trigger {
    grid-row: 1;
  }

  .resume-cluster {
    grid-row: 2;
  }

  .tool-index {
    margin-top: 20px;
  }

  .tool-row {
    min-height: 58px;
  }
}

@container workspace (max-width: 430px) {
  .brand-lockup p {
    white-space: normal;
  }

  .resume-cluster {
    grid-template-columns: 1fr;
  }

  .resume-cluster__more {
    max-width: none;
    min-height: 34px;
  }

  .resume-link--compact {
    flex: 1 1 0;
  }

  .resume-link--compact span {
    display: block;
    overflow: hidden;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-bar,
  .tool-index__heading,
  .tool-group,
  .tool-row {
    animation: none;
  }

  .resume-link--primary:is(:hover, :focus-visible, :active),
  .resume-link--compact:is(:hover, :focus-visible, :active),
  .command-trigger:is(:hover, :focus-visible, :active),
  .tool-group:hover,
  .tool-group__header:active,
  .tool-row:is(:hover, :active),
  .resume-link--primary:is(:hover, :focus-visible, :active) .resume-link__icon,
  .resume-link--primary:is(:hover, :focus-visible) .resume-link__arrow,
  .command-trigger:is(:hover, :focus-visible, :active) > .v-icon,
  .command-trigger:is(:hover, :focus-visible, :active) kbd,
  .tool-group__header:is(:hover, :focus-visible, :active) .tool-group__icon,
  .tool-group__header:is(:hover, :focus-visible) .tool-group__arrow,
  .tool-row:is(:hover, :focus-visible, :active) .tool-row__icon,
  .tool-row:is(:hover, :focus-visible) .tool-row__arrow {
    transform: none;
  }

  .resume-link--primary::after,
  .command-trigger::after,
  .tool-group::before,
  .tool-row::before {
    display: none;
  }
}
</style>
