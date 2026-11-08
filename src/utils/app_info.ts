import {ref, type Ref} from 'vue';
import type { AppInfo } from '@/types/app.ts';
import {getAppInfo} from '@/ipc/commands.ts';

export function fetchAppInfo(): Promise<AppInfo> {
  return getAppInfo();
}

let storeBuild: Promise<boolean> | null = null;

/** Resolves once per session; a failed lookup is retried and treated as non-Store. */
export function isStoreBuild(): Promise<boolean> {
  storeBuild ??= fetchAppInfo()
    .then(info => info.distribution === 'store')
    .catch(() => {
      storeBuild = null;
      return false;
    });
  return storeBuild;
}

/** `null` until known, so Store-hidden UI never flashes before the lookup settles. */
export function useIsStoreBuild(): Ref<boolean | null> {
  const store = ref<boolean | null>(null);
  void isStoreBuild().then((value) => {
    store.value = value;
  });
  return store;
}
