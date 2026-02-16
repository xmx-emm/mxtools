/**
 * object [
 *   '+fps_max 8866',
 *   '8866',
 *   index: 10,
 *   input: 'showpos 1 +fps_max 8866 +miles_l +fps_max 156 ',
 *   groups: undefined
 * ]
 * @param launch_options
 */
export function match_fps(launch_options: string): number | null {
    const match = launch_options.match(/\+fps_max\s+(\d+)/);
    if (match) {
        return Number(match[1]) // 输出: 240
    }
    return null;
}
