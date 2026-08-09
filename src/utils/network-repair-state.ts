export type NetworkRepairPhase =
  | 'idle'
  | 'scanning'
  | 'ready'
  | 'refreshing'
  | 'repairing';

export const INITIAL_NETWORK_REPAIR_PHASE: NetworkRepairPhase = 'idle';

export const NETWORK_REPAIR_CHECK_IDS = [
  'proxy_environment',
  'wininet_proxy',
  'proxy_policy',
  'winhttp_proxy',
  'network_adapters',
  'dns_resolution',
  'internet_connectivity',
] as const;

export function networkRepairLoadPhase(hasReport: boolean): NetworkRepairPhase {
  return hasReport ? 'refreshing' : 'scanning';
}

export function networkRepairLoadFailurePhase(hasReport: boolean): NetworkRepairPhase {
  return hasReport ? 'ready' : 'idle';
}
