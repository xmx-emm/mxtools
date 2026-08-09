<script setup lang="ts">
import type {Component} from 'vue';
import {useRouter} from 'vue-router';

interface ToolHubItemBase {
  path: string;
  title: string;
  description: string;
  action: string;
  icon?: string;
  iconComponent?: Component;
  features: string[];
}

type ToolHubItem = ToolHubItemBase & (
  | {badge?: string; beta?: never}
  | {badge?: never; beta: {label: string; hint: string}}
);

interface ToolHubGuide {
  title: string;
  description: string;
  icon: string;
}

defineProps<{
  eyebrow: string;
  title: string;
  subtitle: string;
  summary: string;
  summaryIcon: string;
  sectionTitle: string;
  sectionSubtitle: string;
  guideTitle: string;
  guideSubtitle: string;
  items: ToolHubItem[];
  guides: ToolHubGuide[];
}>();

const router = useRouter();

function openTool(path: string) {
  void router.push(path);
}
</script>

<template>
  <div class="app-page tool-hub-page">
    <header class="app-page__header tool-hub-header">
      <div class="app-page__heading">
        <div class="app-page__eyebrow">{{ eyebrow }}</div>
        <h1 class="app-page__title">{{ title }}</h1>
        <p class="app-page__subtitle">{{ subtitle }}</p>
      </div>
      <div class="tool-hub-summary">
        <span class="tool-hub-summary__icon" aria-hidden="true">
          <v-icon :icon="summaryIcon" size="18"/>
        </span>
        <span>{{ summary }}</span>
      </div>
    </header>

    <div class="app-page__scroll">
      <main class="app-page__content">
        <section class="tool-hub-section">
          <div class="app-section__header tool-hub-section__header">
            <div>
              <h2 class="app-section__title">{{ sectionTitle }}</h2>
              <p class="app-section__subtitle">{{ sectionSubtitle }}</p>
            </div>
          </div>

          <div class="tool-hub-index">
            <button
              v-for="item in items"
              :key="item.path"
              type="button"
              class="tool-hub-item"
              @click="openTool(item.path)"
            >
              <span class="tool-hub-item__icon" aria-hidden="true">
                <v-icon v-if="item.icon" :icon="item.icon" size="23"/>
                <component
                  :is="item.iconComponent"
                  v-else-if="item.iconComponent"
                  :size="26"
                />
              </span>
              <span class="tool-hub-item__body">
                <span class="tool-hub-item__heading">
                  <span class="tool-hub-item__title">{{ item.title }}</span>
                  <span
                    v-if="item.beta"
                    class="mx-beta-badge"
                    :title="item.beta.hint"
                  >
                    {{ item.beta.label }}
                  </span>
                  <span v-else-if="item.badge" class="tool-hub-item__badge">
                    {{ item.badge }}
                  </span>
                </span>
                <span class="tool-hub-item__description">{{ item.description }}</span>
                <span class="tool-hub-item__features">
                  <span v-for="feature in item.features" :key="feature">{{ feature }}</span>
                </span>
              </span>
              <span class="tool-hub-item__action">
                {{ item.action }}
                <v-icon icon="mdi-chevron-right" size="17" aria-hidden="true"/>
              </span>
            </button>
          </div>
        </section>

        <section class="tool-hub-section tool-hub-guide-section">
          <div class="app-section__header tool-hub-section__header">
            <div>
              <h2 class="app-section__title">{{ guideTitle }}</h2>
              <p class="app-section__subtitle">{{ guideSubtitle }}</p>
            </div>
          </div>
          <div class="tool-hub-guides">
            <article
              v-for="guide in guides"
              :key="guide.title"
              class="tool-hub-guide"
            >
              <span class="tool-hub-guide__icon" aria-hidden="true">
                <v-icon :icon="guide.icon" size="18"/>
              </span>
              <span class="tool-hub-guide__copy">
                <strong>{{ guide.title }}</strong>
                <small>{{ guide.description }}</small>
              </span>
            </article>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.tool-hub-header {
  align-items: center;
}

.tool-hub-summary {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 32px;
  gap: 9px;
  padding-left: 12px;
  color: rgba(var(--v-theme-on-surface), 0.68);
  border-left: 1px solid var(--app-border);
  font-size: 11px;
  font-weight: 600;
}

.tool-hub-summary__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  color: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-primary), 0.22);
  border-radius: var(--app-radius-sm);
  background: rgba(var(--v-theme-primary), 0.08);
}

.tool-hub-section {
  min-width: 0;
}

.tool-hub-section + .tool-hub-section {
  margin-top: 24px;
  padding-top: 21px;
  border-top: 1px solid var(--app-border);
}

.tool-hub-section__header {
  padding: 0 2px 12px;
}

.tool-hub-index {
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
}

.tool-hub-item {
  position: relative;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: 104px;
  gap: 14px;
  padding: 14px 8px;
  color: rgb(var(--v-theme-on-surface));
  border: 0;
  border-radius: 0;
  background: transparent;
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard);
}

.tool-hub-item + .tool-hub-item {
  border-top: 1px solid var(--app-border);
}

.tool-hub-item:hover {
  background: var(--app-hover);
}

.tool-hub-item:focus-visible {
  z-index: 1;
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
  background: rgba(var(--v-theme-primary), 0.055);
}

.tool-hub-item:active {
  background: rgba(var(--v-theme-primary), 0.085);
}

.tool-hub-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-layer-muted);
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    border-color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard);
}

.tool-hub-item:is(:hover, :focus-visible) .tool-hub-item__icon {
  color: rgb(var(--v-theme-primary));
  border-color: rgba(var(--v-theme-primary), 0.34);
  background: rgba(var(--v-theme-primary), 0.1);
}

.tool-hub-item__icon :deep(svg) {
  display: block;
  max-width: 27px;
  max-height: 27px;
}

.tool-hub-item__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tool-hub-item__heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
  gap: 6px 8px;
}

.tool-hub-item__title {
  min-width: 0;
  color: rgba(var(--v-theme-on-surface), 0.94);
  font-size: 14px;
  font-weight: 680;
  line-height: 1.35;
  letter-spacing: 0;
}

.tool-hub-item__badge {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 1px 5px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-layer-muted);
  font-size: 9px;
  font-weight: 650;
  line-height: 1.2;
  letter-spacing: 0;
}

.tool-hub-item__description {
  max-width: 720px;
  margin-top: 4px;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 12px;
  line-height: 1.5;
}

.tool-hub-item__features {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
  gap: 6px 0;
  margin-top: 8px;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 10px;
  font-weight: 560;
  line-height: 1.25;
}

.tool-hub-item__features > span {
  white-space: nowrap;
}

.tool-hub-item__features > span + span {
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid var(--app-border-strong);
}

.tool-hub-item__action {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  gap: 2px;
  padding-left: 12px;
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
  transition: color var(--app-motion-fast) var(--app-ease-standard);
}

.tool-hub-item__action :deep(.v-icon) {
  transition: transform var(--app-motion-fast) var(--app-ease-emphasized);
}

.tool-hub-item:is(:hover, :focus-visible) .tool-hub-item__action {
  color: rgb(var(--v-theme-primary));
}

.tool-hub-item:is(:hover, :focus-visible) .tool-hub-item__action :deep(.v-icon) {
  transform: translateX(2px);
}

.tool-hub-guide-section {
  min-width: 0;
}

.tool-hub-guides {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
}

.tool-hub-guide {
  display: flex;
  align-items: flex-start;
  min-width: 0;
  gap: 10px;
  padding: 13px 10px 14px;
}

.tool-hub-guide + .tool-hub-guide {
  border-left: 1px solid var(--app-border);
}

.tool-hub-guide__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  color: rgb(var(--v-theme-primary));
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-layer-muted);
}

.tool-hub-guide__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tool-hub-guide__copy strong {
  color: rgba(var(--v-theme-on-surface), 0.84);
  font-size: 11px;
  font-weight: 680;
  line-height: 1.4;
}

.tool-hub-guide__copy small {
  margin-top: 3px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 10px;
  line-height: 1.5;
}

@container workspace (max-width: 720px) {
  .tool-hub-header {
    align-items: flex-start;
  }

  .tool-hub-summary {
    display: none;
  }

  .tool-hub-section + .tool-hub-section {
    margin-top: 20px;
    padding-top: 18px;
  }

  .tool-hub-item {
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 11px;
    padding-inline: 4px;
  }

  .tool-hub-item__icon {
    width: 38px;
    height: 38px;
    flex-basis: 38px;
  }

  .tool-hub-item__action {
    grid-column: 2;
    justify-self: start;
    padding-left: 0;
  }

  .tool-hub-guides {
    grid-template-columns: 1fr;
  }

  .tool-hub-guide + .tool-hub-guide {
    border-top: 1px solid var(--app-border);
    border-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tool-hub-item,
  .tool-hub-item__icon,
  .tool-hub-item__action,
  .tool-hub-item__action :deep(.v-icon) {
    transition: none;
  }

  .tool-hub-item:is(:hover, :focus-visible) .tool-hub-item__action :deep(.v-icon) {
    transform: none;
  }
}
</style>
