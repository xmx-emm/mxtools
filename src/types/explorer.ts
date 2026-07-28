export type ContextMenuHive = 'HKCU' | 'HKLM';

export type ContextMenuKind = 'shell' | 'handler';

export interface CustomBackgroundFolder {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
}

export interface ContextMenuItem {
  id: string;
  hive: ContextMenuHive;
  scope: string;
  kind: ContextMenuKind;
  key_name: string;
  display_name: string;
  enabled: boolean;
  command?: string | null;
}
