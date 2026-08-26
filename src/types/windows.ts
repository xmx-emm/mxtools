export type WindowsAccountKind =
  | 'local'
  | 'microsoft'
  | 'active_directory'
  | 'entra'
  | 'unknown';

export interface WindowsUser {
  name: string;
  full_name: string | null;
  sid: string;
  account_name: string;
  account_kind: WindowsAccountKind;
  rdp_username: string | null;
  enabled: boolean;
  password_required: boolean;
  is_current: boolean;
  is_rdp_user: boolean;
  is_administrator: boolean;
  is_system: boolean;
  can_manage_locally: boolean;
}
