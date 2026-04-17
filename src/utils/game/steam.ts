/** Steam 用户头像 CDN；无哈希时返回 undefined,避免请求 `.../_full.jpg`. */
export function steamAvatarUrl(avatar: string | undefined): string | undefined {
  const h = avatar?.trim();
  if (!h) return undefined;
  return `https://avatars.fastly.steamstatic.com/${h}_full.jpg`;
}
