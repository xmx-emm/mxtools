/** The game writes its schema version when it generates videoconfig.txt.
 * Never invent that version or mistake a set of preset values for a baseline.
 */
export function isApexVideoConfigInitialized(values: Record<string, string>): boolean {
  const version = values['setting.configversion'] ?? values['"setting.configversion"'];
  return version != null && /^\d+$/.test(version)
    && Number(version) > 0 && Number(version) <= 0xFFFFFFFF;
}
