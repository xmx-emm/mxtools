import {
  MILES_LANGUAGE_CHECK_CACHE_MS,
  milesLanguageCheckKey,
} from '@/utils/game/apex_store_helpers.ts';
import {
  invalidateMilesLanguageCheckCache,
  milesLanguageCheck,
} from './miles_cache.ts';
import type {ApexStoreThis} from './types.ts';
import {
  cancelApexLanguageDownload,
  cancelApexLanguageDownloadEa,
  checkApexMilesLanguage,
  getApexLanguageDownloadState,
  getApexLanguageDownloadStateEa,
  startApexLanguageDownload,
  startApexLanguageDownloadEa,
} from '@/ipc/commands.ts';
import type {ApexMilesDownloadProgress} from '@/ipc/commands.ts';

export const apexMilesActions = {
  //从steam加载启动数据
  async check_miles_language(this: ApexStoreThis, force = false) {
    const acc = this.active_apex_account;
    const milesEnabled = this.is_enabled_miles_language;
    if (!milesEnabled) {
      invalidateMilesLanguageCheckCache();
      return true;
    }
    if (this.language === 'english') {
      invalidateMilesLanguageCheckCache();
      return true;
    }
    const cacheKey = milesLanguageCheckKey(acc, this.language, milesEnabled);
    const now = Date.now();
    if (
      !force
      && cacheKey
      && milesLanguageCheck.cache
      && milesLanguageCheck.cache.key === cacheKey
      && now - milesLanguageCheck.cache.at < MILES_LANGUAGE_CHECK_CACHE_MS
    ) {
      return milesLanguageCheck.cache.value;
    }
    if (milesLanguageCheck.inFlight) {
      return milesLanguageCheck.inFlight;
    }
    const platform = acc?.kind === 'ea' ? 'ea' : 'steam';
    const eaUserId = acc?.kind === 'ea' ? acc.user.id : null;
    milesLanguageCheck.inFlight = checkApexMilesLanguage({
      language: this.language,
      platform,
      eaUserId,
    })
      .then((is_ok) => {
        if (cacheKey) {
          milesLanguageCheck.cache = { key: cacheKey, at: Date.now(), value: is_ok };
        }
        return is_ok;
      })
      .catch((e) => {
        console.warn('check_apex_miles_language err', this.language, e);
        return false;
      })
      .finally(() => {
        milesLanguageCheck.inFlight = null;
      });
    return milesLanguageCheck.inFlight;
  },

  update_download_language_button_color(this: ApexStoreThis) {
    if (!this.is_enabled_miles_language) {
      this.download_language_button_color = 'on-surface-variant';
      this.is_miles_language_ready = true;
    } else if (this.language === 'english') {//英文语言不需要下载操作
      this.download_language_button_color = 'success';
      this.is_miles_language_ready = true;
    } else if (this.is_enabled_miles_language) {
      this.check_miles_language().then((is_ok: boolean) => {
        this.is_miles_language_ready = is_ok;
        this.download_language_button_color = is_ok ? 'success' : 'error';
      });
    } else {
      this.download_language_button_color = 'info';
    }
  },

  /** 打开一键下载对话框（按平台分发）；若已有进行中的下载则恢复现场 */
  open_miles_auto_download(this: ApexStoreThis) {
    if (this.active_account_is_ea) {
      this.download_miles_language_auto_dialog_ea = true;
      getApexLanguageDownloadStateEa()
        .then((state) => {
          if (state) this.miles_download_progress = state;
        })
        .catch(() => {});
    } else {
      this.download_miles_language_auto_dialog = true;
      getApexLanguageDownloadState()
        .then((state) => {
          if (state) this.miles_download_progress = state;
        })
        .catch(() => {});
    }
  },

  /** EA：一键下载语音包（经 EA App 原生桥切换游戏语言触发增量下载） */
  async start_miles_auto_download_ea(this: ApexStoreThis): Promise<void> {
    this.miles_download_progress = null;
    await startApexLanguageDownloadEa({language: this.language});
  },

  async cancel_miles_auto_download_ea(this: ApexStoreThis, stopEa: boolean): Promise<void> {
    await cancelApexLanguageDownloadEa({stopEa});
  },

  /** Steam：一键下载语音包（后台静默驱动本机 Steam 客户端） */
  async start_miles_auto_download(this: ApexStoreThis): Promise<void> {
    const depot = Number(this.language_depot);
    if (!depot) {
      this.miles_download_progress = {
        phase: 'error',
        depot: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        percent: 0,
        message: 'apex.milesDl.badDepot',
        cefBrowser: '',
      };
      return;
    }
    this.miles_download_progress = null;
    await startApexLanguageDownload({depot});
  },

  async cancel_miles_auto_download(this: ApexStoreThis, stopSteam: boolean): Promise<void> {
    await cancelApexLanguageDownload({stopSteam});
  },

  /** apex-miles-download-progress 事件入口（组件里 listen 后转发到这里） */
  handle_miles_download_event(this: ApexStoreThis, progress: ApexMilesDownloadProgress) {
    this.miles_download_progress = progress;
    if (progress.phase === 'done') {
      invalidateMilesLanguageCheckCache();
      this.update_download_language_button_color();
    }
  },
};
