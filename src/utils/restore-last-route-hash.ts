/**
 * 在加载 `router.ts`（创建 `createWebHashHistory`）之前调用。
 * 若地址栏仍是默认空 hash，则把 fragment 写成上次记录的 fullPath，
 * 使 Vue Router 的首次解析即落在 lastRoute 上，避免「先默认页再 replace」触发的第二次 beforeEach。
 *
 * 若用户已带有具体 hash（如 #/dashboard），则不覆盖，保留其选择。
 */
const RESTORE_EXCLUDED_PATH_PREFIXES = ['/about'] as const;

/** 本次 bootstrap 是否在 import router 之前把 hash 写成了 lastRoute（供 router 跳过重复的 replace） */
let didAlignHashThisBootstrap = false;

export function alignWindowHashWithStoredLastRoute(
  restoreLastRoute: boolean,
  lastRoute: string,
): void {
  didAlignHashThisBootstrap = false;
  if (!restoreLastRoute || !lastRoute) return;
  const trimmed = lastRoute.trim();
  if (!trimmed) return;
  const pathOnly = trimmed.split(/[?#]/)[0] ?? '';
  if (!pathOnly) return;
  if ((RESTORE_EXCLUDED_PATH_PREFIXES as readonly string[]).includes(pathOnly)) return;

  const raw = window.location.hash || '';
  const isDefaultHash = raw === '' || raw === '#' || raw === '#/';
  if (!isDefaultHash) return;

  const fragment = '#' + (trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
  const withoutHash = window.location.href.split('#')[0] ?? '';
  // 用 replaceState 改 fragment，避免对 location.hash 赋值在部分环境触发额外 hashchange/二次同步
  history.replaceState(history.state, '', `${withoutHash}${fragment}`);
  didAlignHashThisBootstrap = true;
}

/**
 * 由 `router.beforeEach` 在「恢复上次路由」分支开头调用一次：
 * 若启动前已预对齐 hash，则不再 `next(replace)`，避免与当前 `to` 的细微差异触发第二次导航。
 */
export function consumeRestoreHashAlignedForRouter(): boolean {
  const v = didAlignHashThisBootstrap;
  didAlignHashThisBootstrap = false;
  return v;
}
