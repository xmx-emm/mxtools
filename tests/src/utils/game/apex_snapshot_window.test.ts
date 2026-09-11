import {describe, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({listen: vi.fn(), emitTo: vi.fn().mockResolvedValue(undefined)}));
vi.mock('@tauri-apps/api/event', () => mocks);
import {prepareSnapshotWindow, SNAPSHOT_WINDOW_LOAD} from '@/utils/game/apex_snapshot_window.ts';

describe('snapshot window handshake', () => {
  it('delivers the latest payload after readiness, isolated by window kind', async () => {
    let ready!: (event: {payload: {kind: 'import' | 'export'}}) => void;
    mocks.listen.mockImplementation(async (_name, callback) => { ready = callback; return vi.fn(); });
    const exported = {path: '', account: 'steam:1', snapshot: 'draft'};
    await prepareSnapshotWindow('export', exported);
    await prepareSnapshotWindow('import', {path: 'first.json', account: 'ea:2', snapshot: ''});
    await prepareSnapshotWindow('import', {path: 'second.json', account: 'ea:2', snapshot: ''});
    expect(mocks.emitTo).not.toHaveBeenCalled();
    ready({payload: {kind: 'export'}});
    expect(mocks.emitTo).toHaveBeenLastCalledWith('apex-config-export-window', SNAPSHOT_WINDOW_LOAD, exported);
    ready({payload: {kind: 'import'}});
    expect(mocks.emitTo).toHaveBeenLastCalledWith('apex-config-import-window', SNAPSHOT_WINDOW_LOAD,
      {path: 'second.json', account: 'ea:2', snapshot: ''});
    expect(mocks.listen).toHaveBeenCalledTimes(1);
  });
});
