import type {RazerPollingStatus} from '@/types/razer_polling.ts';

export function createRazerStatusRefresh(
  probe: () => Promise<RazerPollingStatus[]>,
  apply: (statuses: RazerPollingStatus[]) => void,
) {
  let eventRevision = 0;
  return {
    get eventRevision() { return eventRevision; },
    onEvent(statuses: RazerPollingStatus[]) {
      eventRevision += 1;
      apply(statuses);
    },
    async refresh(): Promise<boolean> {
      const revision = eventRevision;
      const statuses = await probe();
      if (revision !== eventRevision) return false;
      apply(statuses);
      return true;
    },
  };
}
