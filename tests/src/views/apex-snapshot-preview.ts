// Browser-only visual fixture. No native calls or real game writes.
import {createApp, h, ref} from 'vue';
import {createPinia} from 'pinia';
import {VApp} from 'vuetify/components/VApp';
import vuetify from '@/vuetify.ts';
import i18n, {setAppLocale} from '@/i18n/i18n.ts';
import Toast from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';
import ExportPage from '@/components/game/apex/preset/ApexConfigExportPage.vue';
import ImportPage from '@/components/game/apex/preset/ApexConfigImportPage.vue';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import 'vuetify/styles';
import '@/assets/styles/global.css';
import '@/assets/styles/search.css';
const snapshot: ApexConfigSnapshot = {
  kind: 'apex-config-snapshot', version: 1, exportedAt: '',
  launchOptions: {raw: '+fps_max 279 +reticle_color "2147483648 2147483648 2147483648" -novid'},
  videoConfig: {'setting.fullscreen': '1', 'setting.defaultres': '2560', 'setting.defaultresheight': '1440'},
  gameSettings: {settings: {mouse_sensitivity: '1.049330'}, profile: {cl_fovScale: '1.7', gamepad_aim_speed: '2', hud_setting_showTips: '1'},
    bindings: [{input: 'ESCAPE', command: 'ingamemenu_activate', context: 0, occurrence: 0},
      {input: 'START', command: 'ingamemenu_activate', context: 0, occurrence: 1}]},
};
await setAppLocale('zh-CN');
const pinia = createPinia();
useApexStore(pinia).set_config_import_snapshot(snapshot);
const mode = ref('export');
const app = createApp({render: () => h(VApp, {}, {default: () => h('div', {class: 'fixture'}, [
  h('header', [h('button', {onClick: () => {mode.value = 'export';}}, '导出预览'), h('button', {onClick: () => {mode.value = 'import';}}, '导入预览')]),
  mode.value === 'export' ? h(ExportPage, {snapshot, defaults: {...snapshot, launchOptions: {raw: ''},
    videoConfig: {'setting.fullscreen': '1'}, gameSettings: {settings: {mouse_sensitivity: '5'}, profile: {}, bindings: snapshot.gameSettings?.bindings}}, key: 'export'}) : h(ImportPage, {key: 'import'}),
])})});
app.use(pinia).use(vuetify).use(i18n).use(Toast).mount('#app');
const style = document.createElement('style');
style.textContent = '.fixture{height:100vh;display:flex;flex-direction:column;max-width:960px;margin:auto;width:100%}header{padding:12px;border-bottom:1px solid #ddd;display:flex;gap:24px}.fixture>.v-card{flex:1;display:flex;flex-direction:column;min-height:0;border-radius:0;box-shadow:none}.v-card-text{flex:1;min-height:0;overflow:auto;padding:16px 24px}.v-card-actions{flex:none;border-top:1px solid #ddd;padding:12px 24px}';
document.head.append(style);
