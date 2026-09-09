/** J57 rejects versions <7; versions 7-9 use legacy map-detail/SSAO keys.
 * The current catalog requires >=10 within signed int32. This only checks
 * field compatibility, not completeness. See docs/APEX_VIDEO_CONFIG_FORMAT.md.
 */
export function isApexVideoConfigInitialized(values: Record<string, string>): boolean {
  const version = values['setting.configversion'] ?? values['"setting.configversion"'];
  return version != null && /^\d+$/.test(version)
    && Number(version) >= 10 && Number(version) <= 0x7FFFFFFF;
}
