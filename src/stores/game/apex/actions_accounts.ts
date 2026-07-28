import type {ApexLauncherAccount} from '@/types/apex.ts';
import {ApexPageTypeEnum} from '@/enum.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import {useSteamStore} from '@/stores/game/steam.ts';
import {
  launcherAccountKey,
  resolveActiveApexAccount,
} from '@/utils/game/apex_store_helpers.ts';
import {invalidateMilesLanguageCheckCache} from './miles_cache.ts';
import type {ApexStoreThis} from './types.ts';

export const apexAccountActions = {
  set_active_apex_account(this: ApexStoreThis, acc: ApexLauncherAccount) {
    const nextKey = launcherAccountKey(acc);
    if (this.launcher_selection_key !== nextKey) {
      this.launch_loaded_for_key = null;
      this.video_config_loaded = false;
      this.original_launch_options = '';
      this.original_video_config = {};
      this.video_config_values = {};
      invalidateMilesLanguageCheckCache();
    }
    this.launcher_selection_key = nextKey;
    if (acc.kind === 'steam') {
      useSteamStore().set_active_steam_user(acc.user);
    } else {
      useEaStore().set_active_ea_user(acc.user);
    }
  },

  async refresh_apex_accounts(this: ApexStoreThis, options?: { silent?: boolean }) {
    if (this.is_accounts_loading) return;
    const silent = options?.silent ?? false;
    if (!silent) {
      this.is_accounts_loading = true;
    }
    try {
      const steam = useSteamStore();
      const ea = useEaStore();
      await steam.refresh_users({ silent: true });
      await ea.refresh_users();

      const accounts: ApexLauncherAccount[] = [
        ...steam.steam_users.map((user) => ({ kind: 'steam' as const, user })),
        ...ea.ea_desktop_users.map((user) => ({ kind: 'ea' as const, user })),
      ];

      const next = resolveActiveApexAccount(accounts, this.launcher_selection_key);
      if (next) {
        this.set_active_apex_account(next);
      } else {
        this.launcher_selection_key = null;
      }
    } finally {
      if (!silent) {
        this.is_accounts_loading = false;
      }
    }
  },

  set_page_type(this: ApexStoreThis, page: ApexPageTypeEnum) {
    this.page_type = page;
  },
};
