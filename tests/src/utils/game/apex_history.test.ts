import {describe, expect, it} from 'vitest';
import {ApexPageTypeEnum} from '@/enum.ts';
import type {ApexConfigHistoryEntry, ApexLauncherRef} from '@/types/apex_history.ts';
import {
  apexScopeForPage,
  createApexHistoryTransactionId,
  filterApexHistory,
} from '@/utils/game/apex_history.ts';

const steam: ApexLauncherRef = {kind: 'steam', id: '1', name: 'Steam user'};
const ea: ApexLauncherRef = {kind: 'ea', id: '2', name: 'EA user'};

function entry(
  id: string,
  scopes: ApexConfigHistoryEntry['scopes'],
  launcher: ApexLauncherRef | null = null,
): ApexConfigHistoryEntry {
  return {
    id,
    transactionId: id,
    createdAt: '2026-07-29T00:00:00Z',
    source: 'apply',
    scopes,
    launcher,
  };
}

describe('Apex history presentation helpers', () => {
  it('maps each Apex tab to its machine or account history scope', () => {
    expect(apexScopeForPage(ApexPageTypeEnum.launch)).toBe('launch');
    expect(apexScopeForPage(ApexPageTypeEnum.video_config)).toBe('video');
    expect(apexScopeForPage(ApexPageTypeEnum.game_settings)).toBe('gameSettings');
  });

  it('keeps global history visible while isolating launch history by account', () => {
    const entries = [
      entry('steam', ['launch'], steam),
      entry('ea', ['launch'], ea),
      entry('video', ['video']),
      entry('combined', ['launch', 'video'], steam),
    ];
    expect(filterApexHistory(entries, 'all', steam).map(item => item.id)).toEqual([
      'steam',
      'video',
      'combined',
    ]);
    expect(filterApexHistory(entries, 'video', steam).map(item => item.id)).toEqual([
      'video',
      'combined',
    ]);
    expect(filterApexHistory(entries, 'launch', ea).map(item => item.id)).toEqual(['ea']);
  });

  it('creates file-name-safe unique transaction ids', () => {
    const first = createApexHistoryTransactionId();
    const second = createApexHistoryTransactionId();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^apex-[A-Za-z0-9_-]+$/);
    expect(second).toMatch(/^apex-[A-Za-z0-9_-]+$/);
  });
});
