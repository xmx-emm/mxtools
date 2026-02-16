import {createApp} from 'vue';
import App from './App.vue';
import router from './router';
// CSS
// Ensure you are using css-loader
import '@/assets/styles/global.css';
import '@/assets/styles/styles.css';
import '@/assets/styles/utils.css';
// Toast
import Toast from 'vue-toastification';
import 'vue-toastification/dist/index.css'; // Import the CSS or use your own!
//vuetify
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';

// store
import {createPinia} from 'pinia';
import piniaPluginPersistedState from 'pinia-plugin-persistedstate';
//ui
import vuetify from "@/vuetify.ts";
import {toastOptions} from "@/toast.ts";

// i18n
import i18n from '@/i18n/i18n';
import { useSettingsStore } from '@/stores/settings';
import { resolveLocale } from '@/utils/locale';

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPluginPersistedState);
app.use(pinia);

// 应用持久化或系统语言
const settings = useSettingsStore();
i18n.global.locale.value = resolveLocale(settings.locale);

app.use(i18n);
app.use(Toast, toastOptions);
app.use(vuetify);
app.use(router);
app.mount('#app');

// 启动时恢复上次页面；之后在路由变化时持久化当前页
router.isReady().then(() => {
  if (settings.restoreLastRoute && settings.lastRoute) {
    router.replace(settings.lastRoute).catch(() => {});
  }
  router.afterEach((to) => {
    if (settings.restoreLastRoute) {
      settings.setLastRoute(to.fullPath);
    }
  });
});
