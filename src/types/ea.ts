/** EA Desktop 本地 `user_<id>.ini` + 日志关联Persona / 头像 */
export interface EaDesktopUser {
  id: string;
  name: string;
  /** https://eaavatarservice.akamaized.net/production/avatar/prod/userAvatar/xxxxxx/208x208.JPEG */
  avatar: string;
  /** "C:\Users\xxxx\\AppData\\Local\\Electronic Arts\\EA Desktop\\user_xxxxx.ini" */
  config_path: string;
  /** INI `user.userid` */
  user_userid: string;
  /** EADesktop.log `nuchash`,AC2 目录同名 */
  nu_hash: string;
}
