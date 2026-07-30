import type {ApexLauncherAccount} from '@/types/apex.ts';
import type {
  ApexConfigHistoryEntry,
  ApexConfigScope,
  ApexHistorySource,
  ApexLauncherRef,
} from '@/types/apex_history.ts';
import type {ApexPageTypeEnum} from '@/enum.ts';
import {ApexPageTypeEnum as ApexPage} from '@/enum.ts';

let transactionCounter = 0;

export function createApexHistoryTransactionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `apex-${crypto.randomUUID()}`;
  }
  transactionCounter += 1;
  return `apex-${Date.now()}-${transactionCounter}`;
}

export function toApexLauncherRef(account: ApexLauncherAccount): ApexLauncherRef {
  return {
    kind: account.kind,
    id: String(account.user.id),
    name: account.user.name,
  };
}

export function apexScopeForPage(page: ApexPageTypeEnum): ApexConfigScope {
  if (page === ApexPage.video_config) return 'video';
  if (page === ApexPage.game_settings) return 'gameSettings';
  return 'launch';
}

export function filterApexHistory(
  entries: ApexConfigHistoryEntry[],
  scope: ApexConfigScope | 'all',
  launcher: ApexLauncherRef | null,
): ApexConfigHistoryEntry[] {
  return entries.filter(entry => {
    if (scope !== 'all' && !entry.scopes.includes(scope)) return false;
    if (!entry.scopes.includes('launch')) return true;
    if (!entry.launcher || !launcher) return false;
    return entry.launcher.kind === launcher.kind && entry.launcher.id === launcher.id;
  });
}

export function apexHistorySourceKey(source: ApexHistorySource): string {
  return `apex.history.sources.${source}`;
}
