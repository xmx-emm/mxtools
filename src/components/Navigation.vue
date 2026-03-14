<script setup lang="ts">

import {useRoute, useRouter} from 'vue-router';
import {tools} from '../router.ts';
import profilePhoto from '@/assets/images/profile_photo.png';
import {checkRouterSuffix, includesRoute} from '../utils/router.ts';
import {computed} from 'vue';

import {createCssTransition} from 'vuetify/util/transitions';
import AppVersion from "@/components/utils/AppVersion.vue";

const router = useRouter();
const route = useRoute();

const activeTool = computed(() => {
  for (const tool of tools) {
    if (includesRoute(tool.path, route)) {
      return tool;
    }
  }
  return null;
});

const ComponentTransition = createCssTransition('component-transition');

</script>

<template>
  <div>
    <v-navigation-drawer permanent rail expand-on-hover :width="160" class="nav-drawer-primary">
      <v-list density="compact" nav class="px-2">
        <v-list-item
          :prepend-avatar="profilePhoto"
          @click="router.push('/')"
          rounded="lg"
          class="mb-1"
        />
        <v-divider class="my-2" />
        <v-list-item
          v-for="tool in tools"
          :title="$t(tool.nameKey)"
          :key="tool.name"
          @click="router.push(tool.path)"
          :active="includesRoute(tool.path, route)"
          rounded="lg"
          class="mb-1 nav-tool-item"
          active-class="nav-tool-item-active"
        >
          <template v-slot:prepend>
            <v-icon size="small">{{ tool.icon }}</v-icon>
          </template>
        </v-list-item>
      </v-list>

      <template v-slot:append>
        <v-list density="compact" nav class="px-2">
          <AppVersion class="nav-version" />
          <v-list-item
              prepend-icon="mdi-cog"
              @click="router.push('/settings')"
              :title="$t('settings.title')"
              :active="includesRoute('/settings', route)"
              rounded="lg"
              class="mb-1 nav-tool-item"
              active-class="nav-tool-item-active"
              density="compact"
              nav
          />
        </v-list>
      </template>
    </v-navigation-drawer>
    <v-navigation-drawer permanent v-if="activeTool && activeTool.children.length !== 0" :width="220" class="nav-drawer-secondary">
      <v-list class="py-2">
        <v-list-subheader class="text-uppercase text-caption font-weight-medium px-3 py-2" style="opacity: 0.7;">
          <div class="d-flex align-center gap-1">
            <ComponentTransition>
              <v-icon
                v-if="!checkRouterSuffix(activeTool.path, route)"
                icon="mdi-chevron-left"
                size="small"
                class="cursor-pointer"
                @click="router.push(activeTool.path)"
              />
            </ComponentTransition>
            <span @click="router.push(activeTool.path)" class="cursor-pointer">{{ $t(activeTool.nameKey) }}</span>
          </div>
        </v-list-subheader>
        <template v-for="item in activeTool.children" :key="item.path">
          <v-list-item
            :title="$t(item.nameKey)"
            :value="item.path"
            :prepend-icon="item?.iconComponent ? undefined : item.icon"
            @click="router.push(item?.path ?? '/')"
            :active="includesRoute(item.path, route)"
            rounded="lg"
            class="mx-2 mb-1 nav-tool-item"
            active-class="nav-tool-item-active"
          >
            <template v-if="item?.iconComponent" v-slot:prepend>
              <v-icon size="small">
                <component :is="item?.iconComponent" :size="20" />
              </v-icon>
            </template>
          </v-list-item>
        </template>
      </v-list>
    </v-navigation-drawer>
  </div>
</template>
<style lang="scss" scoped>
.nav-drawer-primary :deep(.v-navigation-drawer__content) {
  background: rgb(var(--v-theme-surface));
  border-right: 1px solid rgba(var(--v-border-color), 0.06);
}
.nav-drawer-secondary :deep(.v-navigation-drawer__content) {
  background: rgb(var(--v-theme-surface));
  border-right: 1px solid rgba(var(--v-border-color), 0.06);
}
.nav-tool-item {
  transition: background 0.15s ease, color 0.15s ease;
}
.nav-tool-item :deep(.v-list-item__content) {
  font-weight: 500;
  letter-spacing: -0.01em;
}
.nav-tool-item-active {
  background: rgba(var(--v-theme-primary), 0.1) !important;
  color: rgb(var(--v-theme-primary));
}
.cursor-pointer {
  cursor: pointer;
}
.nav-version {
  text-align: center;
  font-size: 11px;
  opacity: 0.45;
  padding: 4px 0 2px;
  color: var(--grey-darken-3);
}
</style>
<style lang="scss">
.component-transition {
  &-enter-active,
  &-leave-active {
    transition: 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  &-enter-from,
  &-leave-to {
    opacity: 0;
    transform: rotate(180deg) scale(0.2) skew(20deg);
    filter: hue-rotate(90deg);
  }
}
</style>
