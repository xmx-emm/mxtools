<script setup lang="ts">
import type {Component} from 'vue';
import {useRouter} from 'vue-router';

interface ToolHubItem {
  path: string;
  title: string;
  description: string;
  action: string;
  badge?: string;
  icon?: string;
  iconComponent?: Component;
  features: string[];
}

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
        <span class="tool-hub-summary__icon">
          <v-icon :icon="summaryIcon" size="18"/>
        </span>
        <span>{{ summary }}</span>
      </div>
    </header>

    <div class="app-page__scroll">
      <main class="app-page__content">
        <section class="app-section">
          <div class="app-section__header">
            <div>
              <h2 class="app-section__title">{{ sectionTitle }}</h2>
              <p class="app-section__subtitle">{{ sectionSubtitle }}</p>
            </div>
          </div>

          <div class="tool-hub-grid">
            <button
              v-for="(item, itemIndex) in items"
              :key="item.path"
              type="button"
              class="tool-hub-card"
              :style="{'--tool-card-delay': `${80 + itemIndex * 55}ms`}"
              @click="openTool(item.path)"
            >
              <span class="tool-hub-card__top">
                <span class="tool-hub-card__icon">
                  <v-icon v-if="item.icon" :icon="item.icon" size="25"/>
                  <component
                    :is="item.iconComponent"
                    v-else-if="item.iconComponent"
                    :size="28"
                  />
                </span>
                <span v-if="item.badge" class="tool-hub-card__badge">{{ item.badge }}</span>
              </span>
              <span class="tool-hub-card__title">{{ item.title }}</span>
              <span class="tool-hub-card__description">{{ item.description }}</span>
              <span class="tool-hub-card__features">
                <span v-for="feature in item.features" :key="feature">{{ feature }}</span>
              </span>
              <span class="tool-hub-card__action">
                {{ item.action }}
                <v-icon icon="mdi-chevron-right" size="17"/>
              </span>
            </button>
          </div>
        </section>

        <section class="app-section tool-hub-guide-section">
          <div class="app-section__header">
            <div>
              <h2 class="app-section__title">{{ guideTitle }}</h2>
              <p class="app-section__subtitle">{{ guideSubtitle }}</p>
            </div>
          </div>
          <div class="tool-hub-guides">
            <article
              v-for="(guide, guideIndex) in guides"
              :key="guide.title"
              class="tool-hub-guide"
              :style="{'--tool-guide-delay': `${220 + guideIndex * 45}ms`}"
            >
              <span class="tool-hub-guide__icon">
                <v-icon :icon="guide.icon" size="19"/>
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
  gap: 8px;
  flex: 0 0 auto;
  min-height: 34px;
  padding: 4px 11px 4px 5px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-layer);
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 11px;
  font-weight: 600;
}

.tool-hub-summary__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.tool-hub-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 0 14px 14px;
}

.tool-hub-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
  min-height: 226px;
  padding: 17px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background:
    linear-gradient(145deg, rgba(var(--v-theme-primary), 0.04), transparent 52%),
    var(--app-layer-raised);
  color: rgb(var(--v-theme-on-surface));
  text-align: start;
  font: inherit;
  cursor: pointer;
  isolation: isolate;
  overflow: hidden;
  animation: tool-hub-card-enter 440ms var(--app-ease-emphasized) both;
  animation-delay: var(--tool-card-delay, 80ms);
  transition:
    border-color var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized),
    box-shadow var(--app-motion-base) var(--app-ease-standard),
    background var(--app-motion-base) var(--app-ease-standard);
}

.tool-hub-card::before,
.tool-hub-card::after {
  position: absolute;
  z-index: 0;
  content: '';
  pointer-events: none;
}

.tool-hub-card > * {
  position: relative;
  z-index: 1;
}

.tool-hub-card::before {
  top: -1px;
  right: 16px;
  left: 16px;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(var(--v-theme-primary), 0.3),
    rgb(var(--v-theme-primary)),
    rgba(var(--v-theme-primary), 0.3),
    transparent
  );
  opacity: 0;
  transform: scaleX(0.22);
  transition:
    opacity var(--app-motion-base) var(--app-ease-standard),
    transform 360ms var(--app-ease-emphasized);
}

.tool-hub-card::after {
  inset: 0;
  background: linear-gradient(
    112deg,
    transparent 25%,
    rgba(255, 255, 255, 0.075) 44%,
    rgba(var(--v-theme-primary), 0.07) 50%,
    transparent 68%
  );
  opacity: 0;
  transform: translateX(-78%);
  transition:
    opacity 180ms var(--app-ease-standard),
    transform 620ms var(--app-ease-emphasized);
}

.tool-hub-card:hover {
  transform: translateY(-2px);
  border-color: rgba(var(--v-theme-primary), 0.38);
  background:
    linear-gradient(145deg, rgba(var(--v-theme-primary), 0.09), transparent 58%),
    var(--app-layer-raised);
  box-shadow: var(--app-shadow-md);
}

.tool-hub-card:hover::before,
.tool-hub-card:focus-visible::before {
  opacity: 0.9;
  transform: scaleX(1);
}

.tool-hub-card:hover::after {
  opacity: 1;
  transform: translateX(78%);
}

.tool-hub-card:active {
  transform: translateY(0) scale(0.985);
  transition-duration: var(--app-motion-fast);
}

.tool-hub-card:only-child {
  grid-column: 1 / -1;
  min-height: 196px;
}

.tool-hub-card:only-child .tool-hub-card__description {
  max-width: 650px;
  min-height: 0;
}

.tool-hub-card:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.tool-hub-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 15px;
}

.tool-hub-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 11px;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  transition:
    transform var(--app-motion-base) var(--app-ease-emphasized),
    border-color var(--app-motion-base) var(--app-ease-standard),
    background-color var(--app-motion-base) var(--app-ease-standard),
    box-shadow var(--app-motion-base) var(--app-ease-standard);
}

.tool-hub-card:hover .tool-hub-card__icon,
.tool-hub-card:focus-visible .tool-hub-card__icon {
  background: rgba(var(--v-theme-primary), 0.15);
  box-shadow: 0 7px 18px rgba(var(--v-theme-primary), 0.14);
  transform: translateY(-2px) rotate(-2deg) scale(1.035);
}

.tool-hub-card__icon :deep(svg) {
  display: block;
  max-width: 29px;
  max-height: 29px;
}

.tool-hub-card__badge {
  padding: 4px 8px;
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.tool-hub-card__title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0;
}

.tool-hub-card__description {
  min-height: 43px;
  margin-top: 6px;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 12px;
  line-height: 1.55;
}

.tool-hub-card__features {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 13px;
}

.tool-hub-card__features > span {
  padding: 3px 7px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.055);
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 10px;
  font-weight: 580;
}

.tool-hub-card__action {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: auto;
  padding-top: 16px;
  color: rgb(var(--v-theme-primary));
  font-size: 11px;
  font-weight: 680;
}

.tool-hub-card__action :deep(.v-icon) {
  transition: transform var(--app-motion-base) var(--app-ease-emphasized);
}

.tool-hub-card:hover .tool-hub-card__action :deep(.v-icon),
.tool-hub-card:focus-visible .tool-hub-card__action :deep(.v-icon) {
  transform: translateX(3px);
}

.tool-hub-guide-section {
  overflow: hidden;
}

.tool-hub-guides {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--app-border);
}

.tool-hub-guide {
  display: flex;
  gap: 11px;
  min-width: 0;
  padding: 14px 16px 16px;
  animation: tool-hub-guide-enter 380ms var(--app-ease-emphasized) both;
  animation-delay: var(--tool-guide-delay, 220ms);
}

.tool-hub-guide + .tool-hub-guide {
  border-left: 1px solid var(--app-border);
}

.tool-hub-guide__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 31px;
  height: 31px;
  flex: 0 0 31px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.09);
  color: rgb(var(--v-theme-primary));
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized);
}

.tool-hub-guide:hover .tool-hub-guide__icon {
  background: rgba(var(--v-theme-primary), 0.14);
  transform: translateY(-1px) scale(1.04);
}

.tool-hub-guide__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tool-hub-guide__copy strong {
  font-size: 10px;
  font-weight: 680;
}

.tool-hub-guide__copy small {
  margin-top: 3px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 10px;
  line-height: 1.5;
}

@keyframes tool-hub-card-enter {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes tool-hub-guide-enter {
  from {
    opacity: 0;
    transform: translateX(-6px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@container workspace (max-width: 720px) {
  .tool-hub-header {
    align-items: flex-start;
  }

  .tool-hub-summary {
    display: none;
  }

  .tool-hub-grid {
    grid-template-columns: 1fr;
  }

  .tool-hub-card {
    min-height: 210px;
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
  .tool-hub-card,
  .tool-hub-guide {
    animation: none;
  }

  .tool-hub-card:hover,
  .tool-hub-card:active {
    transform: none;
  }

  .tool-hub-card::after {
    display: none;
  }

  .tool-hub-card:hover .tool-hub-card__icon,
  .tool-hub-card:focus-visible .tool-hub-card__icon,
  .tool-hub-card:hover .tool-hub-card__action :deep(.v-icon),
  .tool-hub-card:focus-visible .tool-hub-card__action :deep(.v-icon),
  .tool-hub-guide:hover .tool-hub-guide__icon {
    transform: none;
  }
}
</style>
