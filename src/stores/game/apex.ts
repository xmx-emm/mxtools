import {defineStore} from 'pinia';
import {invoke} from '@tauri-apps/api/core';
import ApexLaunchOptionsConfig, {
  ApexMilesLanguages,
  ApexMilesLanguagesDepot
} from '@/data/apex_launch_options_config.ts';
import {isSteamLaunchOptionsImpl, SteamLaunchOptionsImpl} from '@/data/steam.ts';
import {useToast} from 'vue-toastification';
import eaStore from '@/stores/game/ea.ts';
import steamStore from '@/stores/game/steam.ts';
import type {ApexLauncherAccount} from '@/type.ts';
import {
  match_apex_fps_by_fps_max,
  match_apex_fps_by_freq,
  match_apex_height,
  match_apex_lobby_max_fps,
  match_apex_mat_letterbox_aspect_goal,
  match_apex_mat_letterbox_aspect_min,
  match_apex_mat_letterbox_aspect_threshold,
  match_apex_width
} from '@/utils/game/apex.ts';
import {Component, markRaw} from 'vue';
import {ApexFilterEnum} from '@/enum.ts';

function launcherAccountKey(acc: ApexLauncherAccount): string {
  return `${acc.kind}:${acc.user.id}`;
}

function findApexAccountByKey(accounts: ApexLauncherAccount[], key: string | null): ApexLauncherAccount | null {
  if (!key) return null;
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const kind = key.slice(0, idx) as 'steam' | 'ea';
  const id = key.slice(idx + 1);
  if (kind !== 'steam' && kind !== 'ea') return null;
  return accounts.find((a) => a.kind === kind && a.user.id === id) ?? null;
}

const apexStore = defineStore('apex', {
  state: () => ({
    //语音包
    download_language_button_color: 'info',//下载语音包的按钮颜色
    download_miles_language_semi_automatic_dialog: false,
    /** Steam：手动下载语音包对话框 */
    download_miles_language_manual_dialog: false,
    /** EA：仅支持手动下载语音包 */
    download_miles_language_manual_dialog_ea: false,

    filter_type: ApexFilterEnum.normal,
    filter_search: '',//过滤搜索

    is_start_loading: false,//从steam加载中
    fps: 320,//锁帧
    lobby_max_fps: 0,//大厅帧数


    width: 1920,//强制的宽度
    height: 1080,//强制的高度

    //比例
    mat_letterbox_aspect_min: 1.7778,
    mat_letterbox_aspect_goal: 1.7778,
    mat_letterbox_aspect_threshold: 0.2,

    options_selection: <SteamLaunchOptionsImpl[]>[],//勾选的项
    settings_config: <{ [key: string]: string | any }>({
      // 这里用来放 parameters 的配置,可多选的内容
      window: '-fullscreen',
      fps: '+fps_max unlimited',
      miles_language: '+miles_language japanese',
      miles_channels: '+miles_channels 2',
      graphics_api: '-anticheat_settings=SettingsDX11.json'
    }),//多选项配置

    original_launch_options: '',//从Steam加载后的启动项快照
    is_miles_language_ready: true,//语音包是否就绪

    //提示视图,用来放显示的页面,直接在最上层显示
    tip_view: <Component | null | undefined>null,
    tip_dialog: false,

    /** 用于刷新列表后恢复选中项；合并账户见 getter apex_accounts / active_apex_account */
    launcher_selection_key: <string | null>null,
  }),
  actions: {
    //从steam加载启动数据
    async check_miles_language() {
      const acc = this.active_apex_account;
      const platform = acc?.kind === 'ea' ? 'ea' : 'steam';
      const eaUserId = acc?.kind === 'ea' ? acc.user.id : null;
      for (const item of this.options_selection) {
        if (item.identifier === 'miles_language') {
          if (this.language === 'english') {//默认语言为英语,不需要下载操作
            return true;
          }
          return await invoke<boolean>('check_apex_miles_language', {
            language: this.language,
            platform,
            eaUserId,
          }).then((is_ok) => {
            console.log('check_apex_miles_language ok', is_ok);
            return is_ok;
          }).catch((e) => {
            console.log('check_apex_miles_language err', this.language, e);
            return false;
          });
        }
      }
      return true;
    },
    //通过读取对应steam user用户的loadconfig.vdf获取启动参数并解析
    closeTip() {
      this.tip_dialog = false;
    },
    //在应用时检查配音文件是否存在,反回是否错误的布尔值
    showTip(item: SteamLaunchOptionsImpl) {
      if (item.tip !== null && item.tip !== undefined) {
        this.tip_view = markRaw(item.tip);
        this.tip_dialog = true;
      }
    },
    start_launch() {
      this.is_start_loading = true;
      this.options_selection = [];
      this.download_miles_language_semi_automatic_dialog = false;
      this.download_miles_language_manual_dialog = false;
      this.download_miles_language_manual_dialog_ea = false;
      setTimeout(async () => {
        await this.start_load_apex_launch_options_data();
        this.is_start_loading = false;
        this.original_launch_options = this.launch_options;
        this.update_download_language_button_color();
      }, 300);
    },

    set_active_apex_account(acc: ApexLauncherAccount) {
      this.launcher_selection_key = launcherAccountKey(acc);
      if (acc.kind === 'steam') {
        steamStore().set_active_steam_user(acc.user);
      } else {
        eaStore().set_active_ea_user(acc.user);
      }
    },

    async refresh_apex_accounts() {
      const steam = steamStore();
      const ea = eaStore();
      await steam.refresh_users();
      await ea.refresh_users();

      const accounts: ApexLauncherAccount[] = [
        ...steam.steam_users.map((user) => ({ kind: 'steam' as const, user })),
        ...ea.ea_desktop_users.map((user) => ({ kind: 'ea' as const, user })),
      ];

      let next = findApexAccountByKey(accounts, this.launcher_selection_key);
      if (!next && accounts.length > 0) {
        next = accounts.find((a) => a.kind === 'steam' && a.user.id === steam.active_steam_user?.id)
          ?? accounts.find((a) => a.kind === 'steam')
          ?? accounts[0];
      }
      if (next) {
        this.set_active_apex_account(next);
      } else {
        this.launcher_selection_key = null;
      }
    },

    /** 将已加载的启动参数字符串解析为勾选项(Steam VDF 与 EA INI 共用)
     * 其中 fov_scale在ea与steam中不同
     * */
    parse_loaded_launch_string(start_launch_option: string) {
      console.log('apex_start_launch:', start_launch_option);
      ApexLaunchOptionsConfig.forEach((option) => {
        if (isSteamLaunchOptionsImpl(option)) {
          if (option?.identifier === 'forced_resolution') {
            const h_ok = start_launch_option.includes('-height');
            const w_ok = start_launch_option.includes('-width');
            if (h_ok && w_ok) {
              this.width = match_apex_width(start_launch_option) || 1920;
              this.height = match_apex_height(start_launch_option) || 1080;
              this.options_selection.push(option);
            }
          } else if (option?.identifier === 'reticle_color') {
            if (start_launch_option.includes('+reticle_color')) {
              this.options_selection.push(option);
            }
          } else if (option?.identifier === 'fov_scale') {
            if (start_launch_option.includes('fovScale')) {
              this.options_selection.push(option);
            }
            // } else if (option?.identifier === 'skip_intro_animation') { //可以不用在这里处理?
            //   const is_dev = start_launch_option.includes('-dev');
            //   const is_novid = start_launch_option.includes('-novid');
            //   if (is_dev || is_novid) {
            //     this.options_selection.push(option);
            //   }
          } else if (option?.identifier === 'lobby_max_fps') {
            if (start_launch_option.includes('+lobby_max_fps')) {
              this.lobby_max_fps = match_apex_lobby_max_fps(start_launch_option) || 114;
              this.options_selection.push(option);
            }
          } else if (option?.identifier === 'letterbox_aspect') {
            if (start_launch_option.includes('letterbox_aspect')) {
              this.mat_letterbox_aspect_min = match_apex_mat_letterbox_aspect_min(start_launch_option) || 1.0;
              this.mat_letterbox_aspect_goal = match_apex_mat_letterbox_aspect_goal(start_launch_option) || 1.0;
              this.mat_letterbox_aspect_threshold = match_apex_mat_letterbox_aspect_threshold(start_launch_option) || 0.2;

              this.options_selection.push(option);
            }
          } else if (option?.identifier === 'input_mouse') {
            if (option?.parameters) {
              for (const key in Object.keys(option.parameters)) {
                const value = option.parameters[key];
                if (typeof value?.parameter === 'string' && start_launch_option.includes(value?.parameter)) {
                  this.options_selection.push(option);
                  break;
                }
              }
            }
          } else if (option?.identifier === 'fps') {
            const fps_max_ok = start_launch_option.includes('+fps_max');
            const freq_ok = start_launch_option.includes('+freq');
            if (fps_max_ok || freq_ok) {
              this.fps = match_apex_fps_by_fps_max(start_launch_option) || match_apex_fps_by_freq(start_launch_option) || 114;
              this.options_selection.push(option);
            }
          } else if (option?.parameter) {
            if (typeof option?.parameter === 'string') {
              if (start_launch_option.includes(option?.parameter)) {
                this.options_selection.push(option);
              }
            } else if (typeof option?.parameter === 'object') {
              for (const key in Object.keys(option.parameter)) {
                const value = option.parameter[key];
                if (start_launch_option.includes(value)) {
                  this.options_selection.push(option);
                }
              }
            }
          } else if (option?.parameters) {//只有 window和miles_language需要过这里
            for (const key in Object.keys(option.parameters)) {
              const value = option.parameters[key];
              if (value?.parameter && typeof value?.parameter === 'string' && start_launch_option.includes(value?.parameter)) {
                this.options_selection.push(option);
                if (option?.identifier) {
                  this.settings_config[option.identifier] = value?.default_parameter || value?.parameter || option?.default_parameter;
                }
                break;
              }
            }
          }
        }
      });
    },

    start_load_apex_launch_options_data: async function () {
      const acc = this.active_apex_account;
      const toast = useToast();
      if (!acc) {
        toast.warning('apex.noLauncherAccount');
        return;
      }
      const run = async () => {
        let start_launch_option: string;
        if (acc.kind === 'steam') {
          const id = Number(acc.user.id);
          if (!Number.isFinite(id)) {
            toast.warning('apex.noLauncherAccount');
            return;
          }
          start_launch_option = await invoke<string>('get_apex_launch_option', { id });
        } else {
          start_launch_option = await invoke<string>('get_apex_launch_option_ea', {
            eaUserId: acc.user.id,
          });
        }
        this.parse_loaded_launch_string(start_launch_option);
      };
      try {
        await run();
      } catch (err) {
        console.warn('apex launch option load failed', err);
      }
    },

    update_download_language_button_color() {
      if (!this.is_enabled_miles_language) {
        this.download_language_button_color = 'grey-darken-1';
        this.is_miles_language_ready = true;
      } else if (this.language === 'english') {//英文语言不需要下载操作
        this.download_language_button_color = 'green-lighten-4';
        this.is_miles_language_ready = true;
      } else if (this.is_enabled_miles_language) {
        this.check_miles_language().then((is_ok) => {
          this.is_miles_language_ready = is_ok;
          this.download_language_button_color = is_ok ? 'success' : 'error';
        });
      } else {
        this.download_language_button_color = 'info';
      }
    }
  },
  getters: {
    /** Steam + EA Desktop 合并账户(来自 steamStore / eaStore) */
    apex_accounts(): ApexLauncherAccount[] {
      const steam = steamStore();
      const ea = eaStore();
      return [
        ...steam.steam_users.map((user) => ({ kind: 'steam' as const, user })),
        ...ea.ea_desktop_users.map((user) => ({ kind: 'ea' as const, user })),
      ];
    },
    active_apex_account(state): ApexLauncherAccount | null {
      const accounts = this.apex_accounts;
      let next = findApexAccountByKey(accounts, state.launcher_selection_key);
      if (!next && accounts.length > 0) {
        const steam = steamStore();
        next = accounts.find((a) => a.kind === 'steam' && a.user.id === steam.active_steam_user?.id)
          ?? accounts.find((a) => a.kind === 'steam')
          ?? accounts[0];
      }
      return next;
    },
    //启动参数,最终输入的参数 组合勾选项
    launch_options(state) {
      const items: any[] = [];
      const activeAcc = this.active_apex_account;
      const is_ea = activeAcc?.kind === 'ea';

      state.options_selection.forEach((item: SteamLaunchOptionsImpl) => {
        if (item?.identifier === 'lobby_max_fps') { //大厅fps
          items.push(`+lobby_max_fps ${state.lobby_max_fps}`);
        } else if (item?.identifier === 'reticle_color') {//准星颜色
          if (activeAcc) {
            if (is_ea) {
              items.push(`+reticle_color 2147483648-2147483648-2147483648`);
            } else {
              items.push('+reticle_color "2147483648 2147483648 2147483648"');
            }
          }
        } else if (item?.identifier === 'fov_scale') {//Fov缩放
          if (activeAcc) {
            if (is_ea) {
              items.push(`+cl_fovScale 1.7`);
            } else {
              items.push('+cl_fovScale "1.7"');
            }
          }
        } else if (item?.identifier === 'skip_intro_animation') {//跳过开场动画
          items.push('-novid -dev');
        } else if (item?.identifier === 'forced_resolution') {//强制分辨率
          items.push(`-width ${state.width} -height ${state.height}`);
        } else if (item?.identifier === 'letterbox_aspect') {//宽高比
          items.push(`+mat_letterbox_aspect_min ${state.mat_letterbox_aspect_min}`);
          items.push(`+mat_letterbox_aspect_goal ${state.mat_letterbox_aspect_goal}`);
          items.push(`+mat_letterbox_aspect_threshold ${state.mat_letterbox_aspect_threshold}`);
        } else if (item?.parameter) {
          if (typeof item.parameter === 'string') {
            items.push(item.parameter);
          } else if (typeof item?.default_parameter === 'string') {
            items.push(item.default_parameter);
          } else {
            // parameter: ['-novid', '-dev']
          }
        } else if (item?.parameters) {//多个参数
          if (item.is_combination_parameters) {//组合参数 暂时只有input_mouse用
            const value = item
              .parameters
              .map((item: SteamLaunchOptionsImpl) => item?.parameter)
              .join(' ');
            items.push(value);
          } else if (item?.identifier) {
            const value: string = state.settings_config[item?.identifier];
            if (item.identifier === 'fps' && value.includes('X')) {
              const fps = state.fps.toString();
              items.push(`-freq ${fps}`);
              items.push(`+fps_max ${fps}`);
            } else {
              items.push(value);
            }
          }
        }
      });
      return items.join(' ');
    },
    //获取当前选择的语言标识符
    language(state) {
      const lsp = state.settings_config['miles_language'].split(' ');
      const language: string = lsp[lsp.length - 1]; // 拿后面的标识符
      return language;
    },
    language_depot(): string | null {
      if (this.language in ApexMilesLanguagesDepot) {
        return ApexMilesLanguagesDepot[this.language];
      }
      return null;
    },
    download_language_depot_command() {
      return `download_depot 1172470 ${this.language_depot}`;
    },
    is_enabled_miles_language(state) {
      return state.options_selection.includes(ApexMilesLanguages);
    },
    is_launch_options_modified(state): boolean {
      return state.original_launch_options !== '' && this.launch_options !== state.original_launch_options;
    },
    active_account_is_ea(): boolean {
      return this.active_apex_account?.kind === 'ea';
    },
    active_account_is_steam(): boolean {
      return this.active_apex_account?.kind === 'steam';
    },
    open_apex_url(): string {
      if (this.active_account_is_ea) {
        return 'origin://launchgame/194908';
      }
      return 'steam://rungameid/1172470';
    },
  },
});
export default apexStore;
