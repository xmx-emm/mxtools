<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {openUrl} from '@tauri-apps/plugin-opener';
import {AUTHOR_BILIBILI_URL, GITHUB_AUTHOR_URL, GITHUB_PROJECT_URL, QQ_CHANNEL_URL} from '@/data/url_other.ts';
import avatarImg from '@/assets/images/avatar.jpg';
import alipaySponsorImg from '@/assets/images/sponsor/alipay.webp';
import wechatSponsorImg from '@/assets/images/sponsor/wechat.webp';
import type {AppInfo} from '@/types/app.ts';
import {fetchAppInfo} from '@/utils/app_info.ts';

const { t } = useI18n();
const appInfo = ref<AppInfo | null>(null);
const sponsorDialog = ref(false);
const licenseUrl = `${GITHUB_PROJECT_URL}/blob/master/LICENSE`;

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
  { name: 'Tauri', color: 'primary', icon: 'mdi-rocket-launch' },
  { name: 'Vue 3', color: 'success', icon: 'mdi-vuejs' },
  { name: 'Vuetify', color: 'info', icon: 'mdi-vuetify' },
  { name: 'TypeScript', color: 'primary', icon: 'mdi-language-typescript' }
];
</script>

<template>
  <v-app>
    <v-main class="bg-surface-variant">
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
          <div class="about-hero d-flex align-end text-white">
            <v-card-title>{{ t('about.title') }}</v-card-title>
          </div>

          <v-card-text class="text-center pt-8">
            <v-avatar size="100" class="elevation-6 mb-4" style="margin-top: -80px; border: 4px solid white;">
              <v-img :src="avatarImg" alt="Avatar"></v-img>
            </v-avatar>

            <h2 class="text-h5 font-weight-bold mb-1">{{ t('about.appName') }}</h2>
            <p v-if="versionLine" class="text-body-2 text-on-surface-variant mb-1">{{ versionLine }}</p>
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

          <v-card-actions class="bg-surface pa-4 flex-wrap">
            <v-btn
              v-for="(url,text) in urls"
              :key="text"
              color="primary"
              variant="tonal"
              @click="openUrl(url)"
            >
              {{ t(text) }}
            </v-btn>

            <v-btn
              color="primary"
              variant="tonal"
              @click="sponsorDialog = true"
            >
              {{ t('about.sponsor') }}
            </v-btn>

            <v-btn
              color="primary"
              variant="text"
              @click="openUrl(licenseUrl)"
            >
              {{ t('about.license') }}
            </v-btn>

            <v-spacer></v-spacer>

            <v-btn
              color="on-surface"
              variant="text"
              @click="closeWindow"
            >
              {{ t('common.close') }}
            </v-btn>
          </v-card-actions>
        </v-card>

        <p class="mt-6 text-caption text-on-surface-variant">
          {{ t('about.copyright') }}
        </p>
      </v-container>
    </v-main>

    <v-dialog v-model="sponsorDialog" max-width="720" scrollable>
      <v-card class="rounded-xl">
        <v-card-title class="px-6 pt-5">{{ t('about.sponsorTitle') }}</v-card-title>
        <v-card-text class="px-6">
          <p class="text-body-2 text-on-surface-variant mb-4">
            {{ t('about.sponsorDescription') }}
          </p>

          <v-row dense>
            <v-col cols="12" sm="6">
              <v-card variant="outlined" class="sponsor-card pa-3 text-center">
                <div class="text-subtitle-2 mb-2">{{ t('about.alipay') }}</div>
                <v-img
                  :src="alipaySponsorImg"
                  :alt="t('about.alipayQrAlt')"
                  height="300"
                  contain
                  class="sponsor-qr mx-auto"
                />
              </v-card>
            </v-col>

            <v-col cols="12" sm="6">
              <v-card variant="outlined" class="sponsor-card pa-3 text-center">
                <div class="text-subtitle-2 mb-2">{{ t('about.wechat') }}</div>
                <v-img
                  :src="wechatSponsorImg"
                  :alt="t('about.wechatQrAlt')"
                  height="300"
                  contain
                  class="sponsor-qr mx-auto"
                />
              </v-card>
            </v-col>
          </v-row>

          <p class="text-caption text-on-surface-variant mt-4 mb-0">
            {{ t('about.sponsorDisclaimer') }}
          </p>
        </v-card-text>

        <v-divider></v-divider>

        <v-card-actions class="px-6 py-3">
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="text" @click="sponsorDialog = false">
            {{ t('common.close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<style scoped>
.about-hero {
  min-height: 120px;
  background:
    radial-gradient(circle at 82% 22%, rgba(255, 255, 255, 0.24), transparent 28%),
    linear-gradient(135deg, rgb(var(--v-theme-primary)), rgb(var(--v-theme-secondary)));
}

.gap-2 {
  gap: 8px;
}

.sponsor-card {
  height: 100%;
}

.sponsor-qr {
  max-width: 300px;
}

/* 禁止页面滚动,适合小窗口关于页 */
:deep(html) {
  overflow: hidden !important;
}
</style>
