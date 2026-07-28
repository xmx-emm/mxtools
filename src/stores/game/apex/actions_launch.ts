import {useToast} from 'vue-toastification';
import {Component, markRaw} from 'vue';
import {parseApexLaunchOptionsString} from '@/utils/game/apex_launch_parse.ts';
import type {ApexStoreThis} from './types.ts';
import {
  getApexLaunchOption,
  getApexLaunchOptionEa,
  setApexLaunchOption,
  setApexLaunchOptionEa,
} from '@/ipc/commands.ts';

export const apexLaunchActions = {
  closeTip(this: ApexStoreThis) {
    this.tip_dialog = false;
  },
  //在应用时检查配音文件是否存在,反回是否错误的布尔值
  showTip(this: ApexStoreThis, item: { tip?: Component | null | undefined }) {
    if (item.tip !== null && item.tip !== undefined) {
      this.tip_view = markRaw(item.tip);
      this.tip_dialog = true;
    }
  },
  start_launch(this: ApexStoreThis, force = false) {
    const key = this.launcher_selection_key;
    // 空启动项也算已加载，不能再用 original_launch_options !== '' 判断
    if (!force && key && this.launch_loaded_for_key === key) {
      return;
    }
    void this.load_launch_data();
  },

  async load_launch_data(this: ApexStoreThis) {
    if (this.is_start_loading) return;
    this.is_start_loading = true;
    this.download_miles_language_semi_automatic_dialog = false;
    this.download_miles_language_manual_dialog = false;
    this.download_miles_language_manual_dialog_ea = false;
    try {
      const ok = await this.start_load_apex_launch_options_data();
      if (ok) {
        this.original_launch_options = this.launch_options;
        this.launch_loaded_for_key = this.launcher_selection_key;
        this.update_download_language_button_color();
      }
    } finally {
      this.is_start_loading = false;
    }
  },

  /** 刷新账户列表并重新加载启动项(单一加载态,避免 overlay 与列表项 spinner 叠层) */
  async reload_launch_page(this: ApexStoreThis) {
    if (this.is_start_loading) return;
    this.is_start_loading = true;
    this.download_miles_language_semi_automatic_dialog = false;
    this.download_miles_language_manual_dialog = false;
    this.download_miles_language_manual_dialog_ea = false;
    try {
      await this.refresh_apex_accounts({ silent: true });
      const ok = await this.start_load_apex_launch_options_data();
      if (ok) {
        this.original_launch_options = this.launch_options;
        this.launch_loaded_for_key = this.launcher_selection_key;
        this.update_download_language_button_color();
      }
    } finally {
      this.is_start_loading = false;
    }
  },

  /** 将已加载的启动参数字符串解析为勾选项(Steam VDF 与 EA INI 共用)
   * 其中 fov_scale在ea与steam中不同
   * */
  parse_loaded_launch_string(this: ApexStoreThis, start_launch_option: string) {
    const parsed = parseApexLaunchOptionsString(start_launch_option);
    this.options_selection = parsed.selection;
    if (parsed.width !== undefined) this.width = parsed.width;
    if (parsed.height !== undefined) this.height = parsed.height;
    if (parsed.lobby_max_fps !== undefined) this.lobby_max_fps = parsed.lobby_max_fps;
    if (parsed.mat_letterbox_aspect_min !== undefined) this.mat_letterbox_aspect_min = parsed.mat_letterbox_aspect_min;
    if (parsed.mat_letterbox_aspect_goal !== undefined) this.mat_letterbox_aspect_goal = parsed.mat_letterbox_aspect_goal;
    if (parsed.mat_letterbox_aspect_threshold !== undefined) this.mat_letterbox_aspect_threshold = parsed.mat_letterbox_aspect_threshold;
    if (parsed.fps !== undefined) this.fps = parsed.fps;
    for (const [key, value] of Object.entries(parsed.settingsPatch)) {
      this.settings_config[key] = value;
    }
  },

  async start_load_apex_launch_options_data(this: ApexStoreThis): Promise<boolean> {
    const acc = this.active_apex_account;
    const toast = useToast();
    if (!acc) {
      toast.warning('apex.noLauncherAccount');
      this.options_selection = [];
      return false;
    }
    const run = async () => {
      let start_launch_option: string;
      if (acc.kind === 'steam') {
        const id = Number(acc.user.id);
        if (!Number.isFinite(id)) {
          toast.warning('apex.noLauncherAccount');
          throw new Error('INVALID_STEAM_USER_ID');
        }
        start_launch_option = await getApexLaunchOption({ id });
      } else {
        start_launch_option = await getApexLaunchOptionEa({
          eaUserId: acc.user.id,
        });
      }
      this.parse_loaded_launch_string(start_launch_option);
    };
    try {
      await run();
      return true;
    } catch (err) {
      console.warn('apex launch option load failed', err);
      const detail = (err instanceof Error ? err.message : String(err ?? '')).trim();
      if (detail === 'INVALID_STEAM_USER_ID') {
        return false;
      }
      const prefixKey = acc.kind === 'steam'
        ? 'apex.launchOptionLoadSteamFailed'
        : 'apex.launchOptionLoadEaFailed';
      toast.error(detail ? `${prefixKey}\n${detail}` : prefixKey, {timeout: 8000});
      this.options_selection = [];
      return false;
    }
  },

  /** 将当前 launch_options 写入 Steam / EA(不含启动器关闭检测) */
  async persist_launch_options(this: ApexStoreThis): Promise<void> {
    const acc = this.active_apex_account;
    if (!acc) {
      throw new Error('NO_LAUNCHER_ACCOUNT');
    }
    if (acc.kind === 'steam') {
      const id = Number(acc.user.id);
      if (!Number.isFinite(id) || id <= 0) {
        throw new Error(`无效的 Steam 用户 id: ${acc.user.id}`);
      }
      await setApexLaunchOption({
        id,
        launchOption: this.launch_options,
      });
    } else {
      const eaUserId = String(acc.user.id ?? '').trim();
      if (!eaUserId || !/^\d+$/.test(eaUserId)) {
        throw new Error(`无效的 EA 用户 id: ${acc.user.id}`);
      }
      await setApexLaunchOptionEa({
        eaUserId,
        launchOption: this.launch_options,
      });
    }
    this.original_launch_options = this.launch_options;
    this.launch_loaded_for_key = this.launcher_selection_key;
  },
};
