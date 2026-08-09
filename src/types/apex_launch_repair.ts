export type ApexLaunchRepairLauncher = 'steam' | 'ea';

export interface ApexLaunchRepairTarget {
  launcher: ApexLaunchRepairLauncher;
  accountId: string;
}

export type ApexLaunchRepairCheckStatus = 'pass' | 'info' | 'warning' | 'error';
export type ApexLaunchRepairActionMode = 'batch' | 'confirm' | 'external';

export interface ApexLaunchRepairAction {
  id: string;
  mode: ApexLaunchRepairActionMode;
  requiresAdmin: boolean;
  restartRequired: boolean;
  recommended: boolean;
}

export interface ApexLaunchRepairCheckResult {
  id: string;
  status: ApexLaunchRepairCheckStatus;
  detailCode: string;
  params: Record<string, string | number | boolean | null>;
  actions: ApexLaunchRepairAction[];
}

export interface ApexLaunchRepairActionResult {
  action: string;
  success: boolean;
  errorCode: string | null;
  restartRequired: boolean;
  changedItems: string[];
}
