export type InputMethodKind = 'layout' | 'tip' | 'language_keyboard';

export interface InputMethodCapabilities {
  can_reorder: boolean;
  can_remove: boolean;
  can_open_settings: boolean;
  has_wubi_lexicon: boolean;
  is_microsoft_pinyin: boolean;
  is_microsoft_wubi: boolean;
}

export interface InputMethodItem {
  id: string;
  name: string;
  kind: InputMethodKind;
  lang_id: string;
  enabled: boolean;
  order: number;
  settings_uri?: string | null;
  capabilities: InputMethodCapabilities;
  input_method_tip?: string | null;
}

export interface WubiLexiconInfo {
  system_lex_path: string;
  system_lex_size: number;
  user_udp_path: string;
  user_udp_size: number;
  backups: string[];
  has_wubi_installed: boolean;
}
