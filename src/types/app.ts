export type AppDistribution = 'development' | 'portable' | 'installer' | 'store';

export interface AppInfo {
  version: string;
  distribution: AppDistribution;
}
