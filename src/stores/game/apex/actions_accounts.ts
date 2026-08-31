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

const accountLoadRequests = new WeakMap<object, Promise<void>>();

export const apexAccountActions = {
  set_active_apex_account(this: ApexStoreThis, acc: ApexLauncherAccount) {
    const nextKey = launcherAccountKey(acc);
    if (this.launcher_selection_key !== nextKey) {
      this.launch_request_generation += 1;
      this.is_start_loading = false;
      this.launch_loading_for_key = null;
      this.launch_load_status = 'idle';
      this.launch_loaded_for_key = null;
      this.original_launch_options = '';
      this.custom_launch_options = '';
      invalidateMilesLanguageCheckCache();
    }
    this.launcher_selection_key = nextKey;
    if (acc.kind === 'steam') {
      useSteamStore().set_active_steam_user(acc.user);
    } else {
      useEaStore().set_active_ea_user(acc.user);
    }
  },

  async refresh_apex_accounts(this: ApexStoreThis, _options?: { silent?: boolean }) {
    if (this.is_accounts_loading) {
      return accountLoadRequests.get(this) ?? Promise.resolve();
    }
    const generation = ++this.accounts_request_generation;
    this.is_accounts_loading = true;
    this.accounts_load_status = 'loading';
    this.accounts_load_error = null;
    const request = (async () => {
      try {
        const steam = useSteamStore();
        const ea = useEaStore();
        await Promise.all([
          steam.refresh_users({silent: true}),
          ea.refresh_users(),
        ]);

        const accounts: ApexLauncherAccount[] = [
          ...steam.steam_users.map((user) => ({ kind: 'steam' as const, user })),
          ...ea.ea_desktop_users.map((user) => ({ kind: 'ea' as const, user })),
        ];

        if (generation !== this.accounts_request_generation) return;
        const next = resolveActiveApexAccount(accounts, this.launcher_selection_key);
        if (next) {
          this.set_active_apex_account(next);
        } else {
          this.launcher_selection_key = null;
        }
        this.accounts_loaded = true;
        this.accounts_loaded_key = 'launchers';
        this.accounts_load_status = 'ready';
      } catch (error) {
        if (generation !== this.accounts_request_generation) return;
        this.accounts_load_error = String(error);
        this.accounts_load_status = 'error';
        throw error;
      } finally {
        if (generation === this.accounts_request_generation) {
          this.is_accounts_loading = false;
          accountLoadRequests.delete(this);
        }
      }
    })();
    accountLoadRequests.set(this, request);
    return request;
  },

  set_page_type(this: ApexStoreThis, page: ApexPageTypeEnum) {
    this.page_type = page;
  },
};
