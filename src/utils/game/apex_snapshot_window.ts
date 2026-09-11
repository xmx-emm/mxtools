import {emitTo, listen} from '@tauri-apps/api/event';

export type SnapshotWindowKind = 'import' | 'export';
export interface SnapshotWindowRequest { path: string; account: string; snapshot: string }
export const SNAPSHOT_WINDOW_LOAD = 'mx-apex-config-window-load';
export const SNAPSHOT_WINDOW_READY = 'mx-apex-config-window-ready';
export const SNAPSHOT_WINDOW_PROBE = 'mx-apex-config-window-probe';
const requests = new Map<SnapshotWindowKind, SnapshotWindowRequest>();
let listening: Promise<unknown> | undefined;

/** Register before creating a WebView. Its ready event is the delivery handshake. */
export async function prepareSnapshotWindow(kind: SnapshotWindowKind, request: SnapshotWindowRequest) {
  requests.set(kind, request);
  listening ??= listen<{kind: SnapshotWindowKind}>(SNAPSHOT_WINDOW_READY, event => {
    const current = requests.get(event.payload.kind);
    if (current) void emitTo(`apex-config-${event.payload.kind}-window`, SNAPSHOT_WINDOW_LOAD, current)
      .catch(error => console.warn('send snapshot to window failed', error));
  }).catch(error => { listening = undefined; throw error; });
  await listening;
}
