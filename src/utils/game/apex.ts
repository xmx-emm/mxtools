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
export function match_apex_fps_by_fps_max(launch_options: string): number | null {
    const match = launch_options.match(/(?:^|\s)\+fps_max\s+(\d+)(?=\s|$)/);
    if (match) {
        return Number(match[1])
    }
    return null;
}
export function match_apex_fps_by_freq(launch_options: string): number | null {
    const match = launch_options.match(/(?:^|\s)\+freq\s+(\d+)(?=\s|$)/);
    if (match) {
        return Number(match[1])
    }
    return null;
}

export function match_apex_lobby_max_fps(launch_options: string): number | null {
    const match = launch_options.match(/(?:^|\s)\+lobby_max_fps\s+(\d+)(?=\s|$)/);
    if (match) {
        return Number(match[1])
    }
    return null;
}

export function match_apex_width(launch_options: string): number | null {
    const match = launch_options.match(/(?:^|\s)-width\s+(\d+)(?=\s|$)/);
    if (match) {
        return Number(match[1])
    }
    return null;
}

export function match_apex_height(launch_options: string): number | null {
    const match = launch_options.match(/(?:^|\s)-height\s+(\d+)(?=\s|$)/);
    if (match) {
        return Number(match[1])
    }
    return null;
}

export function match_apex_mat_letterbox_aspect_min(launch_options: string): number | null {
    // 正则说明：
    // \d+\.?\d* 匹配 整数(1)、浮点数(1.2、3.14 等)
    const match = launch_options.match(/(?:^|\s)\+mat_letterbox_aspect_min\s+(\d+\.?\d*)(?=\s|$)/);
    if (match) {
        return Number(match[1])
    }
    return null;
}
