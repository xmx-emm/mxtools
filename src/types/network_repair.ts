export type NetworkRepairCheckStatus = 'pass' | 'warning' | 'error';

export interface NetworkRepairCheck {
  id: string;
  status: NetworkRepairCheckStatus;
  detailCode: string;
  params: Record<string, string | number | boolean>;
  repairActions: string[];
  requiresAdmin: boolean;
}

export interface NetworkRepairActionResult {
  action: string;
  success: boolean;
  errorCode: string | null;
  restartRequired: boolean;
}
