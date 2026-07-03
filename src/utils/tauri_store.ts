const STARTED_KEY = '__mx_tauri_store_started_v1';

/** 开发环境 HMR 下避免同一 Pinia store 重复 `$tauri.start()` */
export async function startTauriStoreOnce(id: string, start: () => Promise<void>) {
  const g = globalThis as { [STARTED_KEY]?: Set<string> };
  if (!g[STARTED_KEY]) {
    g[STARTED_KEY] = new Set();
  }
  if (g[STARTED_KEY].has(id)) {
    return;
  }
  await start();
  g[STARTED_KEY].add(id);
}
