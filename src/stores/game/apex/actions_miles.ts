import {useDownloadsStore, isFinishedDownload} from '@/stores/downloads.ts';
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
    if (!force && milesLanguageCheck.inFlight && milesLanguageCheck.inFlightKey === cacheKey) {
      return milesLanguageCheck.inFlight;
    }
    const platform = acc?.kind === 'ea' ? 'ea' : 'steam';
    const eaUserId = acc?.kind === 'ea' ? acc.user.id : null;
    const pending = checkApexMilesLanguage({
      language: this.language,
      platform,
      eaUserId,
    })
      .then((is_ok) => {
        if (cacheKey && milesLanguageCheck.inFlight === pending) {
          milesLanguageCheck.cache = { key: cacheKey, at: Date.now(), value: is_ok };
        }
        return is_ok;
      })
      .catch((e) => {
        console.warn('check_apex_miles_language err', this.language, e);
        return false;
      })
      .finally(() => {
        if (milesLanguageCheck.inFlight === pending) {
          milesLanguageCheck.inFlight = null;
          milesLanguageCheck.inFlightKey = null;
        }
      });
    milesLanguageCheck.inFlight = pending;
    milesLanguageCheck.inFlightKey = cacheKey;
    return pending;
  },

  update_download_language_button_color(this: ApexStoreThis) {
    if (!this.is_enabled_miles_language) {
      this.download_language_button_color = 'on-surface-variant';
      this.is_miles_language_ready = true;
    } else if (this.language === 'english') {//英文语言不需要下载操作
      this.download_language_button_color = 'success';
      this.is_miles_language_ready = true;
    } else if (this.is_enabled_miles_language) {
      const key = this.launcher_selection_key;
      const language = this.language;
      this.check_miles_language().then((is_ok: boolean) => {
        if (key !== this.launcher_selection_key || language !== this.language) return;
        this.is_miles_language_ready = is_ok;
        this.download_language_button_color = is_ok ? 'success' : 'error';
      });
    } else {
      this.download_language_button_color = 'info';
    }
  },

  /** Reopening is not proof that a historical completed download still exists. */
  async open_miles_auto_download(this: ApexStoreThis) {
    const platform = this.active_account_is_ea ? 'ea' : 'steam';
    const language = this.language;
    const accountKey = this.launcher_selection_key;
    this.miles_download_progress = null;
    this.miles_download_job_id = null;
    this.download_miles_language_auto_dialog_ea = platform === 'ea';
    this.download_miles_language_auto_dialog = platform === 'steam';
    const downloads = useDownloadsStore();
    await downloads.initialize().catch(error => console.warn('initialize downloads', error));
    await downloads.refresh();
    if (this.language !== language || this.launcher_selection_key !== accountKey) return;
    const job = downloads.jobs.find(job => job.platform === platform && job.language === language && !isFinishedDownload(job.status));
    this.miles_download_job_id = job?.id ?? null;
    const ready = await this.check_miles_language(true);
    if (this.language !== language || this.launcher_selection_key !== accountKey) return;
    this.is_miles_language_ready = ready;
    this.download_language_button_color = ready ? 'success' : 'error';
  },

  async start_miles_auto_download_ea(this: ApexStoreThis): Promise<void> {
    this.miles_download_progress = null;
    const downloads = useDownloadsStore();
    const job = downloads.jobs.find(job => job.id === this.miles_download_job_id && job.language === this.language && job.platform === 'ea');
    if (job?.status === 'paused') await downloads.control(job.id, 'resume');
    else this.miles_download_job_id = await downloads.enqueue('ea', this.language);
  },

  async cancel_miles_auto_download_ea(this: ApexStoreThis, stopEa: boolean): Promise<void> {
    if (this.miles_download_job_id !== null) await useDownloadsStore().control(this.miles_download_job_id, 'cancel');
    else await cancelApexLanguageDownloadEa({stopEa});
  },

  async start_miles_auto_download(this: ApexStoreThis): Promise<void> {
    this.miles_download_progress = null;
    const downloads = useDownloadsStore();
    const job = downloads.jobs.find(job => job.id === this.miles_download_job_id && job.language === this.language && job.platform === 'steam');
    if (job?.status === 'paused') await downloads.control(job.id, 'resume');
    else this.miles_download_job_id = await downloads.enqueue('steam', this.language);
  },

  async cancel_miles_auto_download(this: ApexStoreThis, stopSteam: boolean): Promise<void> {
    if (this.miles_download_job_id !== null) await useDownloadsStore().control(this.miles_download_job_id, 'cancel');
    else await cancelApexLanguageDownload({stopSteam});
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
