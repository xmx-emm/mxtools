<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {openUrl} from '@tauri-apps/plugin-opener';
import {AUTHOR_BILIBILI_URL, GITHUB_AUTHOR_URL, GITHUB_PROJECT_URL, QQ_CHANNEL_URL} from '@/data/url_other.ts';
import avatarImg from '@/assets/images/avatar.jpg';
import type {AppInfo} from '@/types/app.ts';
import {fetchAppInfo} from '@/utils/app_info.ts';

const { t } = useI18n();
const appInfo = ref<AppInfo | null>(null);

onMounted(() => {
  fetchAppInfo()
    .then((info) => {
      appInfo.value = info;
    })
    .catch(() => {
      /* 非 Tauri 环境忽略 */
    });
});

const versionLine = computed(() => {
  if (!appInfo.value) return '';
  return t('about.versionLabel', { version: appInfo.value.version });
});

const distributionLabel = computed(() => {
  if (!appInfo.value) return '';
  return t(`about.distribution.${appInfo.value.distribution}`);
});
const appWindow = getCurrentWindow();
const urls = {
  'about.bilibili': AUTHOR_BILIBILI_URL,
  'about.qqChannel': QQ_CHANNEL_URL,
  'about.github': GITHUB_AUTHOR_URL,
  'about.project': GITHUB_PROJECT_URL,
};
const closeWindow = async () => {
  await appWindow.close();
};

const techStack = [
  { name: 'Tauri', color: 'blue-darken-2', icon: 'mdi-rocket-launch' },
  { name: 'Vue 3', color: 'green-darken-1', icon: 'mdi-vuejs' },
  { name: 'Vuetify', color: 'blue-lighten-1', icon: 'mdi-vuetify' },
  { name: 'TypeScript', color: 'blue-darken-1', icon: 'mdi-language-typescript' }
];
</script>

<template>
  <v-app>
    <v-main class="bg-grey-lighten-4">
      <v-container
        :initial="{ opacity: 0, y: 50 }"
        :enter="{ opacity: 1, y: 0, transition: { duration: 600 } }"
        class="fill-height d-flex flex-column align-center justify-center"
      >
        <v-card
          elevation="4"
          max-width="450"
          class="rounded-xl overflow-hidden"
        >
          <v-img
            height="120"
            src="https://cdn.vuetifyjs.com/images/cards/server-room.jpg"
            cover
            class="align-end text-white"
          >
            <v-card-title>{{ t('about.title') }}</v-card-title>
          </v-img>

          <v-card-text class="text-center pt-8">
            <v-avatar size="100" class="elevation-6 mb-4" style="margin-top: -80px; border: 4px solid white;">
              <v-img :src="avatarImg" alt="Avatar"></v-img>
            </v-avatar>

            <h2 class="text-h5 font-weight-bold mb-1">{{ t('about.appName') }}</h2>
            <p v-if="versionLine" class="text-body-2 text-grey-darken-1 mb-1">{{ versionLine }}</p>
            <v-chip
              v-if="distributionLabel"
              class="mb-4"
              size="small"
              variant="tonal"
              color="primary"
            >
              {{ distributionLabel }}
            </v-chip>

            <v-divider class="mb-4"></v-divider>

            <p class="text-body-1 px-4 mb-6">
              {{ t('about.description') }}
            </p>

            <div class="d-flex flex-wrap justify-center gap-2 mb-6">
              <v-chip
                v-for="tech in techStack"
                :key="tech.name"
                :color="tech.color"
                size="small"
                variant="flat"
                class="ma-1"
                :prepend-icon="tech.icon"
              >
                {{ tech.name }}
              </v-chip>
            </div>
          </v-card-text>

          <v-divider></v-divider>

          <v-card-actions class="bg-grey-lighten-5 pa-4">
            <v-btn
              v-for="(url,text) in urls"
              color="pink-lighten-1"
              variant="tonal"
              @click="openUrl(url)"
            >
              {{ t(text) }}
            </v-btn>

            <v-spacer></v-spacer>

            <v-btn
              color="grey-darken-3"
              variant="text"
              @click="closeWindow"
            >
              {{ t('common.close') }}
            </v-btn>
          </v-card-actions>
        </v-card>

        <p class="mt-6 text-caption text-grey">
          {{ t('about.copyright') }}
        </p>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.gap-2 {
  gap: 8px;
}

/* 禁止页面滚动,适合小窗口关于页 */
:deep(html) {
  overflow: hidden !important;
}
</style>
