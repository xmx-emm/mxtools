/** apex.0w0.online 在线账号（设备码登录） */

export interface OnlineAccount {
  id: string;
  email: string;
  displayName: string | null;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
}

export interface OnlineDeviceLoginStart {
  /** 展示格式 XXXX-XXXX */
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  /** 轮询间隔（秒） */
  interval: number;
}

export type OnlineDeviceLoginPoll =
  | {status: 'pending'}
  | {status: 'slowDown'}
  | {status: 'denied'}
  | {status: 'expired'}
  | {status: 'approved'; account: OnlineAccount};

/** 在线预设（apex.0w0.online /presets） */

export type OnlinePresetScope = 'launchOptions' | 'videoConfig' | 'gameSettings';

export interface OnlinePresetListItem {
  id: string;
  title: string;
  description: string | null;
  scopes: OnlinePresetScope[];
  appVersion: string | null;
  usageCount: number;
  commentCount: number;
  author: {id: string; displayName: string | null} | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnlinePresetUseResult {
  id: string;
  usageCount: number;
  /** ApexConfigSnapshot v1 原文 */
  payload: unknown;
}

export interface OnlinePresetComment {
  id: string;
  authorId: string;
  author: {id: string; displayName: string | null} | null;
  parentId: string | null;
  body: string;
  createdAt: string;
  children?: OnlinePresetComment[];
}

export interface OnlinePresetListQuery {
  q?: string;
  scope?: OnlinePresetScope;
  sort?: 'latest' | 'popular';
  cursor?: string;
  limit?: number;
}
