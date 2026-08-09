<script setup lang="ts">
import {computed} from 'vue';
import type {Component} from 'vue';
import {useI18n} from 'vue-i18n';
import {tools} from '@/router.ts';
import {useSettingsStore} from '@/stores/settings.ts';

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
  '/razer_polling': 'razerPolling.subtitle',
  '/apex': 'game.apexDescription',
  '/pubg': 'game.pubgDescription',
  '/folder_sharing': 'folderSharing.subtitle',
  '/explorer': 'explorer.commonFoldersSubtitle',
  '/remote_desktop': 'rdp.status.subtitle',
  '/input_method': 'inputMethod.description',
  '/app_repair': 'appRepair.subtitle',
  '/port_forwarding': 'portForwarding.description',
};

const {t} = useI18n();
const settings = useSettingsStore();

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
                  v-for="item in group.children"
                  :key="item.path"
                  :to="item.path"
                  class="tool-row"
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
  width: min(100%, var(--app-page-max-width));
  margin: 0 auto;
  padding: var(--app-page-padding-y) var(--app-page-padding-x) 34px;
}

.workspace-bar {
  display: grid;
  grid-template-columns: minmax(180px, 0.8fr) minmax(280px, 1.2fr);
  align-items: center;
  gap: 28px;
  min-height: 76px;
  padding: 2px 2px 18px;
  border-bottom: 1px solid var(--app-border);
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
  border-radius: var(--app-radius-md);
  background: rgba(var(--v-theme-primary), 0.09);
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
  min-width: 0;
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
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: var(--app-control-height-field);
  gap: 9px;
  padding: 6px 9px;
  border: 1px solid rgba(var(--v-theme-primary), 0.22);
  border-radius: var(--app-radius-md);
  background: rgba(var(--v-theme-primary), 0.07);
  transition:
    border-color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard),
    box-shadow var(--app-motion-fast) var(--app-ease-standard);
}

.resume-link--primary:is(:hover, :focus-visible) {
  border-color: rgba(var(--v-theme-primary), 0.42);
  background: rgba(var(--v-theme-primary), 0.11);
}

.resume-link--primary:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.66);
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.18);
}

.resume-link--primary:active {
  background: rgba(var(--v-theme-primary), 0.14);
}

.resume-link__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  color: rgb(var(--v-theme-primary));
  border-radius: var(--app-radius-sm);
  background: rgba(var(--v-theme-primary), 0.1);
  transition: background-color var(--app-motion-fast) var(--app-ease-standard);
}

.resume-link--primary:is(:hover, :focus-visible) .resume-link__icon {
  background: rgba(var(--v-theme-primary), 0.15);
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
  transition: color var(--app-motion-fast) var(--app-ease-standard);
}

.resume-link--primary:is(:hover, :focus-visible) .resume-link__arrow,
.tool-group__header:is(:hover, :focus-visible) .tool-group__arrow,
.tool-row:is(:hover, :focus-visible) .tool-row__arrow {
  color: rgb(var(--v-theme-primary));
}

.resume-cluster__more {
  display: flex;
  align-items: stretch;
  width: min(220px, 100%);
  min-width: 110px;
  gap: 4px;
}

.resume-link--compact {
  display: inline-flex;
  flex: 1 1 110px;
  min-width: 0;
  align-items: center;
  justify-content: center;
  min-width: var(--app-control-height-action);
  min-height: var(--app-control-height-field);
  gap: 5px;
  padding: 0 8px;
  color: rgba(var(--v-theme-on-surface), 0.64);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: rgba(var(--v-theme-surface), 0.52);
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    border-color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard),
    box-shadow var(--app-motion-fast) var(--app-ease-standard);
}

.resume-link--compact span {
  display: block;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resume-link--compact:is(:hover, :focus-visible) {
  color: rgb(var(--v-theme-primary));
  border-color: rgba(var(--v-theme-primary), 0.3);
  background: rgba(var(--v-theme-primary), 0.07);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.08);
}

.resume-link--compact:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.62);
}

.resume-link--compact:active {
  background: rgba(var(--v-theme-primary), 0.12);
}

.tool-index {
  margin-top: var(--app-space-6);
}

.tool-index__heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
  padding: 0 2px;
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
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-layer);
  transition:
    border-color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard);
}

.tool-group:is(:hover, :focus-within) {
  border-color: rgba(var(--v-theme-primary), 0.22);
  background: var(--app-layer-raised);
}

.tool-group__header {
  display: flex;
  align-items: center;
  min-height: var(--app-control-height-field);
  gap: 9px;
  padding: 6px 10px;
  color: inherit;
  border-bottom: 1px solid var(--app-border);
  text-decoration: none;
  transition:
    background-color var(--app-motion-fast) var(--app-ease-standard),
    box-shadow var(--app-motion-fast) var(--app-ease-standard);
}

.tool-group__header:is(:hover, :focus-visible) {
  background: rgba(var(--v-theme-primary), 0.055);
}

.tool-group__header:focus-visible {
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.5);
}

.tool-group__header:active {
  background: rgba(var(--v-theme-primary), 0.1);
}

.tool-group__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 var(--app-control-height-compact);
  width: var(--app-control-height-compact);
  height: var(--app-control-height-compact);
  color: rgb(var(--v-theme-primary));
  border-radius: var(--app-radius-sm);
  background: rgba(var(--v-theme-primary), 0.09);
  transition: background-color var(--app-motion-fast) var(--app-ease-standard);
}

.tool-group__header:is(:hover, :focus-visible) .tool-group__icon {
  background: rgba(var(--v-theme-primary), 0.14);
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
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 64px;
  gap: 10px;
  padding: 8px;
  color: inherit;
  border: 1px solid transparent;
  border-radius: var(--app-radius-sm);
  text-decoration: none;
  transition:
    border-color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard),
    box-shadow var(--app-motion-fast) var(--app-ease-standard);
}

.tool-row + .tool-row {
  margin-top: 2px;
}

.tool-row:is(:hover, :focus-visible) {
  border-color: rgba(var(--v-theme-primary), 0.14);
  background: rgba(var(--v-theme-primary), 0.055);
}

.tool-row:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.48);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.12);
}

.tool-row:active {
  background: rgba(var(--v-theme-primary), 0.1);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.16);
}

.tool-row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 var(--app-control-height-action);
  width: var(--app-control-height-action);
  height: var(--app-control-height-action);
  color: rgba(var(--v-theme-on-surface), 0.72);
  border: 1px solid rgba(var(--v-border-color), 0.075);
  border-radius: var(--app-radius-sm);
  background: rgba(var(--v-theme-on-surface), 0.035);
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    border-color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard);
}

.tool-row:is(:hover, :focus-visible) .tool-row__icon {
  color: rgb(var(--v-theme-primary));
  border-color: rgba(var(--v-theme-primary), 0.22);
  background: rgba(var(--v-theme-primary), 0.08);
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

@media (max-width: 960px) {
  .workspace-bar {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .workspace-bar {
    min-height: 0;
    padding-top: 0;
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
    min-height: var(--app-control-height-field);
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

  .tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container workspace (max-width: 620px) {
  .workspace-bar {
    min-height: 0;
    padding-top: 0;
  }

  .tool-grid {
    grid-template-columns: 1fr;
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
    min-height: var(--app-control-height-field);
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
</style>
