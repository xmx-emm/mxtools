export type AppDistribution = 'development' | 'portable' | 'installer';

export interface AppInfo {
  version: string;
  distribution: AppDistribution;
}
