export type AppRepairTarget = 'store' | 'onedrive';

export type AppRepairCheckStatus = 'pass' | 'warning' | 'error' | 'blocked';

export interface AppRepairCheckResult {
  id: string;
  status: AppRepairCheckStatus;
  detailCode: string;
  params: Record<string, string | number>;
  repairAction: string | null;
  requiresAdmin: boolean;
}

export interface AppRepairActionResult {
  action: string;
  success: boolean;
  errorCode: string | null;
  restartRequired: boolean;
}
