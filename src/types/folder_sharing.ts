export type SharePermission = 'read' | 'change';
export type HealthStatus = 'pass' | 'warning' | 'error' | 'unknown';

export interface FolderSharingError {
  code: string;
  message: string;
  win32Code?: number;
}

export interface LocalShare {
  name: string;
  path: string;
  description: string;
  uncPath: string;
  currentUsers: number;
  special: boolean;
  temporary: boolean;
  diskShare: boolean;
}

export interface ShareAccount {
  accountName: string;
  displayName: string;
  sid: string;
  enabled: boolean;
  source: string;
  passwordRequired: boolean;
  selectable: boolean;
  wellKnown: boolean;
}

export interface SharePrincipal {
  accountName: string;
  sid: string;
  permission: SharePermission;
}

export interface ShareMutationRequest {
  originalName: string | null;
  name: string;
  path: string;
  description: string;
  principals: SharePrincipal[];
}

export interface ShareAccessEntry {
  accountName: string;
  sid: string;
  accessRight: string;
  accessControlType: string;
}

export interface ShareAccessSummary {
  name: string;
  access: ShareAccessEntry[];
}

export interface NtfsAclChange {
  accountName: string;
  sid: string;
  permission: SharePermission;
  requiredRights: string;
  willAdd: boolean;
}

export interface NtfsAclPreview {
  path: string;
  beforeSddl: string;
  afterSddl: string | null;
  changes: NtfsAclChange[];
}

export interface ShareDetails {
  share: LocalShare;
  access: ShareAccessEntry[];
  acl: NtfsAclPreview;
}

export type ShareApplyResult = ShareDetails;

export interface RemoveShareResult {
  name: string;
  path: string;
  aclCleaned: boolean;
  aclCleanupSkipped: boolean;
}

export interface NetworkDevice {
  name: string;
  remoteName: string;
  provider: string;
}

export interface RemoteShare {
  name: string;
  description: string;
  uncPath: string;
  special: boolean;
  diskShare: boolean;
}

export interface MappedDrive {
  localPath: string;
  remotePath: string;
  provider: string;
  persistent: boolean;
  connected: boolean;
}

export interface RemoteConnectionRequest {
  remotePath: string;
  localPath: string | null;
  username: string | null;
  password: string | null;
  persistent: boolean;
  prompt: boolean;
  saveCredentials: boolean;
}

export interface SmbSession {
  sessionId: string;
  clientComputerName: string;
  clientUserName: string;
  numOpens: number;
  dialect: string;
  encrypted: boolean;
  signed: boolean;
  secondsIdle: number;
  secondsExists: number;
}

export interface SmbOpenFile {
  fileId: string;
  sessionId: string;
  clientComputerName: string;
  clientUserName: string;
  path: string;
  shareRelativePath: string;
  permissions: string;
  locks: number;
}

export interface SmbActivity {
  sessions: SmbSession[];
  openFiles: SmbOpenFile[];
}

export interface ShareHealthCheck {
  id: string;
  status: HealthStatus;
  value: string;
  repairAction: string | null;
}

export interface NetworkProfile {
  interfaceIndex: number;
  name: string;
  category: string;
  ipv4Connectivity: string;
}

export interface ShareHealthReport {
  computerName: string;
  addresses: string[];
  profiles: NetworkProfile[];
  checks: ShareHealthCheck[];
}

export interface RepairResult {
  action: string;
  success: boolean;
  message: string;
}
