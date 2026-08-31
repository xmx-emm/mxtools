import {computed, onUnmounted, ref, shallowRef, type ComputedRef, type Ref} from 'vue';
import {useToast} from 'vue-toastification';
import {useSteamStore} from '@/stores/game/steam.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import {
  eaDesktopIsRunningByTasklist,
  apexIsRunning,
  steamIsRunningByTasklist,
  thoroughlyKillApex,
  thoroughlyKillEaDesktop,
  thoroughlyKillSteam,
} from '@/ipc/commands.ts';
import {nextGeneration, shouldRunApply} from '@/composables/applyGeneration.ts';
import {useProcessPollUntilExit} from '@/composables/useProcessPollUntilExit.ts';

export type CloseProcessKind = 'apex' | 'steam' | 'ea';
export type LauncherKind = Exclude<CloseProcessKind, 'apex'>;

export async function isCloseProcessRunning(kind: CloseProcessKind): Promise<boolean> {
  if (kind === 'apex') return apexIsRunning();
  if (kind === 'steam') return steamIsRunningByTasklist();
  return eaDesktopIsRunningByTasklist();
}

export async function detectRunningProcesses(
  kinds: CloseProcessKind[],
): Promise<CloseProcessKind[]> {
  const results = await Promise.all(
    [...new Set(kinds)].map(async kind => ({kind, running: await isCloseProcessRunning(kind)})),
  );
  return results.filter(result => result.running).map(result => result.kind);
}

export async function forceCloseProcesses(kinds: CloseProcessKind[]): Promise<void> {
  await Promise.all([...new Set(kinds)].map(async kind => {
    if (kind === 'apex') await thoroughlyKillApex();
    else if (kind === 'steam') await thoroughlyKillSteam();
    else await thoroughlyKillEaDesktop();
  }));
}

const DEFAULT_WAIT_CLOSE_POLL_MS = 1500;
/** 等待启动器自行退出的最长时间；超时后停止轮询并提示用户。 */
const DEFAULT_WAIT_CLOSE_MAX_MS = 120_000;

export type CloseLauncherThenApplyOptions = {
  /** 关闭后写入启动项 */
  apply: () => void | Promise<void>;
  /** 轮询间隔(ms) */
  pollMs?: number;
  /** 轮询超时(ms)，默认 120s */
  pollMaxMs?: number;
  /**
   * 应用前可选校验；返回 false 则中止(调用方自行 toast)。
   * 例如 Apex 语音包检查。
   */
  beforeApply?: () => boolean | Promise<boolean>;
  /**
   * 决定需要关闭哪个启动器；返回 null 表示无需关闭、直接 apply。
   * 未提供时：仅在 Steam 运行时要求关 Steam。
   */
  resolveCloseKind?: () => LauncherKind | null | Promise<LauncherKind | null>;
  /** 决定需要关闭的全部进程；优先于 resolveCloseKind。 */
  resolveCloseProcesses?: () => CloseProcessKind[] | Promise<CloseProcessKind[]>;
};

/**
 * 关闭 Apex/Steam/EA 进程集合 → 轮询直至全部退出 → 再执行写入。
 * Apex / PUBG 的 Apply 按钮共用此流程。
 */
export function useCloseLauncherThenApply(options: CloseLauncherThenApplyOptions) {
  const toast = useToast();
  const steam_store = useSteamStore();
  const ea_store = useEaStore();

  const dialog = shallowRef(false);
  const close_processes = ref<CloseProcessKind[]>([]);
  const required_processes = ref<CloseProcessKind[]>([]);
  const is_thoroughly_kill = ref(false);
  const is_apply_running = ref(false);
  /** 递增以作废进行中的 async apply，避免与强制关闭双跑。 */
  const generation = ref(0);
  const poll_ms = options.pollMs ?? DEFAULT_WAIT_CLOSE_POLL_MS;
  const poll_max_ms = options.pollMaxMs ?? DEFAULT_WAIT_CLOSE_MAX_MS;
  /** 当前轮询对应的 apply 代际（由 start 时写入） */
  let poll_expected_generation = 0;

  function bump_generation() {
    generation.value = nextGeneration(generation.value);
    return generation.value;
  }

  async function are_processes_still_running(): Promise<boolean> {
    const running = await detectRunningProcesses(required_processes.value);
    close_processes.value = running;
    return running.length > 0;
  }

  async function refresh_launcher_running_flag() {
    const launcher = required_processes.value.find(kind => kind === 'steam' || kind === 'ea');
    if (launcher === 'steam') {
      void steam_store.check_is_steam_running();
    } else if (launcher === 'ea') {
      void ea_store.check_is_ea_desktop_running();
    }
  }

  async function run_apply(expected_generation: number) {
    if (
      !shouldRunApply({
        currentGeneration: generation.value,
        expectedGeneration: expected_generation,
        isApplyRunning: is_apply_running.value,
      })
    ) {
      return;
    }
    try {
      await options.apply();
    } finally {
      if (generation.value === expected_generation) {
        is_apply_running.value = false;
      }
    }
  }

  const poll = useProcessPollUntilExit({
    isRunning: are_processes_still_running,
    pollMs: poll_ms,
    maxMs: poll_max_ms,
    onExit: async () => {
      const expected = poll_expected_generation;
      dialog.value = false;
      await refresh_launcher_running_flag();
      await run_apply(expected);
    },
    onTimeout: async () => {
      const expected = poll_expected_generation;
      if (generation.value === expected) {
        toast.error('toast.launcherCloseTimeout');
        is_apply_running.value = false;
      }
    },
  });

  function stop_monitoring() {
    poll.stop();
  }

  function continuously_monitor_until_closed() {
    poll_expected_generation = bump_generation();
    poll.start();
  }

  async function force_close_launcher() {
    is_thoroughly_kill.value = true;
    stop_monitoring();
    const expected = bump_generation();
    try {
      await forceCloseProcesses(close_processes.value);
      if (generation.value !== expected) {
        return;
      }
      const remainingChecks = await Promise.all(
        required_processes.value.map(async kind => ({kind, running: await isCloseProcessRunning(kind)})),
      );
      const remaining = remainingChecks.filter(result => result.running).map(result => result.kind);
      if (remaining.length > 0) {
        if (generation.value !== expected) {
          return;
        }
        toast.error('apex.closeProcesses.closeFailed');
        close_processes.value = remaining;
        continuously_monitor_until_closed();
        return;
      }
      dialog.value = false;
      await refresh_launcher_running_flag();
      await run_apply(expected);
    } catch (error) {
      console.warn('force close processes failed', error);
      toast.error('apex.closeProcesses.closeFailed');
      if (generation.value === expected) continuously_monitor_until_closed();
    } finally {
      is_thoroughly_kill.value = false;
    }
  }

  function cancel() {
    bump_generation();
    dialog.value = false;
    is_thoroughly_kill.value = false;
    stop_monitoring();
    is_apply_running.value = false;
  }

  async function default_resolve_close_kind(): Promise<LauncherKind | null> {
    await steam_store.check_is_steam_running();
    return steam_store.is_steam_running ? 'steam' : null;
  }

  async function apply_check() {
    if (is_apply_running.value) return;
    is_apply_running.value = true;
    const expected = bump_generation();
    try {
      if (options.beforeApply) {
        const ok = await options.beforeApply();
        if (!ok) {
          if (generation.value === expected) {
            is_apply_running.value = false;
          }
          return;
        }
      }
      if (generation.value !== expected) {
        return;
      }
      const processes = options.resolveCloseProcesses
        ? await options.resolveCloseProcesses()
        : [await (options.resolveCloseKind ?? default_resolve_close_kind)()].filter(
          (kind): kind is LauncherKind => kind !== null,
        );
      if (generation.value !== expected) {
        return;
      }
      if (processes.length > 0) {
        required_processes.value = [...new Set(processes)];
        close_processes.value = [...required_processes.value];
        dialog.value = true;
        // 覆盖 apply_check 的 expected：轮询 / 强制关闭用新代际
        continuously_monitor_until_closed();
        return;
      }
      stop_monitoring();
      await run_apply(expected);
    } catch (e) {
      console.warn('apply_check failed', e);
      toast.error(formatApplyLaunchOptionError(e), {timeout: 8000});
      if (generation.value === expected) {
        is_apply_running.value = false;
      }
    }
  }

  onUnmounted(() => {
    bump_generation();
    stop_monitoring();
  });

  return {
    dialog,
    close_processes: close_processes as Ref<CloseProcessKind[]>,
    is_thoroughly_kill,
    is_apply_running,
    apply_check,
    force_close_launcher,
    cancel,
    stop_monitoring,
  };
}

/** 按钮描边：运行中/未改动 → 空；需关启动器 → 红；可直接应用 → 绿 */
export function useApplyButtonClass(opts: {
  busy: Ref<boolean> | ComputedRef<boolean>;
  modified: Ref<boolean> | ComputedRef<boolean>;
  needsWarning: Ref<boolean> | ComputedRef<boolean>;
}) {
  return computed(() => {
    if (opts.busy.value || !opts.modified.value) return '';
    if (opts.needsWarning.value) return 'warning-red-text-edge-animate';
    return 'success-green-text-edge-animate';
  });
}

export function formatApplyLaunchOptionError(err: unknown): string {
  const detail = (err instanceof Error ? err.message : String(err ?? '')).trim();
  if (!detail || detail === 'undefined' || detail === '[object Object]') {
    return 'toast.applyLaunchOptionError';
  }
  return `toast.applyLaunchOptionError\n${detail}`;
}
