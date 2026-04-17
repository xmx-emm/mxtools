export interface Ipv {
  address: string,
  port: number,
}

export interface PortForwarding {
  listen: Ipv,
  connect: Ipv,
}

export interface SteamUser {
  name: string,
  id: string,
  /** 默认头像 fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb */
  avatar: string,
  /** "c:/program files (x86)/steam\\userdata\\xxxxx\\config\\localconfig.vdf" */
  config_path: string,
}

/** EA Desktop 本地 `user_<id>.ini` + 日志关联的 Persona / 头像 */
export interface EaDesktopUser {
  id: string,
  name: string,
  /** https://eaavatarservice.akamaized.net/production/avatar/prod/userAvatar/xxxxxx/208x208.JPEG */
  avatar: string,
  /** "C:\Users\xxxx\\AppData\\Local\\Electronic Arts\\EA Desktop\\user_xxxxx.ini" */
  config_path: string,
  /** INI `user.userid` */
  user_userid: string,
  /** EADesktop.log `nuchash`,与 AC2 目录同名 */
  nu_hash: string,
}

export type ApexLauncherAccount =
  | { kind: 'steam', user: SteamUser }
  | { kind: 'ea', user: EaDesktopUser };

export interface WindowsUser {
  name: string,
  is_rdp_user: boolean,
}

export interface RdpConnection {
  name: string,
  ip: string,
  port: number,
  username: string,
}
