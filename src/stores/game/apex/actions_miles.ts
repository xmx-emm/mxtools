import {
  MILES_LANGUAGE_CHECK_CACHE_MS,
  milesLanguageCheckKey,
} from '@/utils/game/apex_store_helpers.ts';
import {
  invalidateMilesLanguageCheckCache,
  milesLanguageCheck,
} from './miles_cache.ts';
import type {ApexStoreThis} from './types.ts';
import {checkApexMilesLanguage} from '@/ipc/commands.ts';

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
};
