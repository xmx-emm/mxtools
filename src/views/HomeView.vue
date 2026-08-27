<script setup lang="ts">
import Navigation from '@/components/Navigation.vue';
import AppTopBar from '@/components/AppTopBar.vue';
import AppCommandPalette from '@/components/command/AppCommandPalette.vue';
import {useCommandPalette} from '@/composables/useCommandPalette.ts';

const {openCommandPalette} = useCommandPalette();
</script>

<template>
  <v-main class="home-main">
    <AppTopBar show-command-palette @open-command-palette="openCommandPalette" />
    <div class="home-body">
      <Navigation class="nav-root"/>
      <router-view v-slot="{ Component, route }">
        <Transition name="workspace-route" mode="out-in">
          <component :is="Component" :key="route.path" class="home-content" />
        </Transition>
      </router-view>
    </div>
    <AppCommandPalette />
  </v-main>
</template>

<style scoped>
.home-main {
  display: flex;
  flex-flow: column;
  height: 100vh;
  overflow: hidden;
  background: rgb(var(--v-theme-background));
}

.home-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  overflow: hidden;
}

.nav-root {
  height: 100%;
  align-self: stretch;
}

.home-content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  height: 100%;
  container: workspace / inline-size;
}

/* 进场把不透明度和位移拆成两条时长：内容先可读，再继续滑到位，
   与页头强调线 80ms 延迟的擦入形成分层，而不是所有属性同时结束。 */
:global(.workspace-route-enter-active) {
  transition:
    opacity var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-slow) var(--app-ease-emphasized);
  will-change: opacity, transform;
}

:global(.workspace-route-enter-from) {
  opacity: 0;
  transform: translate3d(0, 10px, 0);
}

/* 离场只做快速淡出：反向位移在 out-in 下看不清，只会让切换发飘。 */
:global(.workspace-route-leave-active) {
  transition: opacity var(--app-motion-fast) var(--app-ease-standard);
  will-change: opacity;
}

:global(.workspace-route-leave-to) {
  opacity: 0;
}

@container workspace (max-width: 720px) {
  :global(.app-page__header) {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 10px 16px;
  }

  :global(.app-page__header > *:last-child:not(:first-child)) {
    margin-left: auto;
  }

  :global(.app-page__content) {
    --app-page-padding-x: 16px;
    --app-page-padding-y: 16px;
  }
}

/* 降低动态效果时只保留淡入淡出；离场本身已无位移。 */
@media (prefers-reduced-motion: reduce) {
  :global(.workspace-route-enter-from) {
    transform: none !important;
  }
}
</style>
