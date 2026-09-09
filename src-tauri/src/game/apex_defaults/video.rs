//! Hardware-dependent default video configuration.
//! Optional PC tier overrides are rejected before generation.
use windows_tool::vdf::{parse_vdf_string, VdfValue};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct DisplayMode {
    pub width: u32,
    pub height: u32,
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Debug)]
pub(crate) struct Hardware {
    pub system_memory_mb: u64,
    pub video_memory_mb: u64,
    pub vendor_id: u32,
    pub device_id: u32,
    // J57 treats Intel non-UMA adapters as level 3 after dxsupport lookup.
    pub intel_non_uma: bool,
    pub desktop_width: u32,
    pub desktop_height: u32,
    // DXGI adapter 0 / output 0, R8G8B8A8_UNORM, flags 0, native order.
    pub modes: Vec<DisplayMode>,
}

fn integer(node: &VdfValue, key: &str) -> Option<u64> {
    let value = node.get_value(key)?;
    if let Some(hex) = value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
    {
        u64::from_str_radix(hex, 16).ok()
    } else {
        value.parse().ok()
    }
}

fn hardware_levels(text: &str, hw: &Hardware) -> Result<(usize, u32), String> {
    let invalid = || "apex.history.errors.defaultResourcesChanged".to_string();
    let tree = parse_vdf_string(text).map_err(|_| invalid())?;
    let Some(VdfValue::Object(groups)) = tree.get("dxsupport") else {
        return Err(invalid());
    };
    let mut memory_level = 0;
    let mut gpu_level = None;
    let mut has_memory_rules = false;
    let mut has_gpu_rules = false;
    for node in groups.values() {
        if node.get_value("name") == Some("System Memory") {
            let min = integer(node, "min megabytes").ok_or_else(invalid)?;
            let max = integer(node, "max megabytes").ok_or_else(invalid)?;
            let level = integer(node, "mem_level")
                .filter(|v| *v <= 3)
                .ok_or_else(invalid)? as usize;
            has_memory_rules = true;
            // Both bounds are inclusive; highest matching level wins.
            if (min..=max).contains(&hw.system_memory_mb) {
                memory_level = memory_level.max(level);
            }
        }
        if node.get_value("vendorid").is_some() {
            has_gpu_rules = true;
            let vendor = integer(node, "vendorid").ok_or_else(invalid)?;
            let min = integer(node, "mindeviceid").ok_or_else(invalid)?;
            let max = integer(node, "maxdeviceid").ok_or_else(invalid)?;
            let level = integer(node, "gpu_level")
                .filter(|v| *v <= 3)
                .ok_or_else(invalid)? as u32;
            // Lowest matching level <=3 wins; absent match leaves startup's 0.
            if vendor == hw.vendor_id as u64 && (min..=max).contains(&(hw.device_id as u64)) {
                gpu_level = Some(gpu_level.map_or(level, |old: u32| old.min(level)));
            }
        }
    }
    if !has_memory_rules || !has_gpu_rules {
        return Err(invalid());
    }
    Ok((
        memory_level,
        if hw.intel_non_uma {
            3
        } else {
            gpu_level.unwrap_or(0)
        },
    ))
}

fn aspect(width: u32, height: u32) -> usize {
    let ratio = width as f32 / height as f32;
    [
        4.0_f32 / 3.0,
        16.0 / 9.0,
        16.0 / 10.0,
        2.0 / 3.0,
        17.0 / 9.0,
    ]
    .into_iter()
    .enumerate()
    .min_by(|(_, a), (_, b)| (a - ratio).abs().total_cmp(&(b - ratio).abs()))
    .unwrap()
    .0
}

fn eligible_modes(hw: &Hardware) -> Vec<DisplayMode> {
    let group = aspect(hw.desktop_width, hw.desktop_height);
    let mut modes: Vec<DisplayMode> = Vec::new();
    for raw in &hw.modes {
        if modes.len() == 1024 {
            break;
        }
        if raw.width < 1152
            || raw.height < 720
            || raw.width > hw.desktop_width
            || raw.height > hw.desktop_height
        {
            continue;
        }
        let mut mode = *raw;
        let mode_group = if group == 3 {
            aspect(raw.height, raw.width)
        } else {
            if (raw.width as f32 / raw.height as f32) < 4.0_f32 / 3.0 {
                continue;
            }
            aspect(raw.width, raw.height)
        };
        if group != 3 && mode_group != group {
            continue;
        }
        if let Some(previous) = modes.last_mut() {
            if (previous.width == raw.width && previous.height == raw.height)
                || (previous.width == raw.height && previous.height == raw.width)
            {
                previous.numerator = raw.numerator;
                previous.denominator = raw.denominator;
                continue;
            }
        }
        if group == 3 {
            if mode_group != 1 || raw.height > hw.desktop_width {
                continue;
            }
            mode.width = raw.height;
            mode.height = raw.width;
        }
        modes.push(mode);
    }
    modes
}

fn dvs_times(hw: &Hardware, memory_level: usize) -> Result<(u32, u32), String> {
    let invalid = || "apex.history.errors.defaultDisplayUnavailable".to_string();
    let modes = eligible_modes(hw);
    let mode = modes.last().ok_or_else(invalid)?;
    if mode.denominator == 0 {
        return Err(invalid());
    }
    let refresh = (mode.numerator as f32 / mode.denominator as f32 + 0.5).trunc() as u32;
    let base = if memory_level == 0 { 30 } else { 60 };
    let divisor = refresh / base;
    // Do not substitute a made-up refresh rate for an unsupported display path.
    if divisor == 0 {
        return Err(invalid());
    }
    let target = (refresh as f32 / divisor as f32 + 0.5).floor() as u32;
    let frame = ((1.0 / target as f64) * 1_000_000.0).trunc() as u32;
    let cut_two = frame * 2 / 100;
    Ok((frame - frame * 3 / 100 - cut_two, frame - cut_two))
}

fn texture_budget(vram: u64, memory_level: usize) -> u32 {
    // Preserve the unused zero slot so later tier indices remain stable.
    let tier = [1900, 2400, 0, 3900, 5900, 7900, u64::MAX]
        .iter()
        .position(|threshold| vram < *threshold)
        .unwrap_or(0);
    let capped = tier.min([3, 4, 5, 6][memory_level]);
    // File budget values differ from in-memory texture budgets.
    [
        0, 160_000, 300_000, 600_000, 1_000_000, 2_000_000, 3_000_000,
    ][capped]
}

pub(crate) fn generate(dxsupport: &str, hw: &Hardware) -> Result<String, String> {
    if hw.system_memory_mb == 0
        || hw.video_memory_mb > i32::MAX as u64
        || hw.desktop_width == 0
        || hw.desktop_height == 0
    {
        return Err("apex.history.errors.defaultHardwareUnavailable".into());
    }
    let (memory_level, gpu_level) = hardware_levels(dxsupport, hw)?;
    let (dvs_min, dvs_max) = dvs_times(hw, memory_level)?;
    let (shadow_size, shadow_upres) = if hw.video_memory_mb < 4000 {
        (128, 2)
    } else if hw.video_memory_mb < 8000 {
        (256, 2)
    } else {
        (256, 3)
    };
    // Final startup normalization recaches desktop dimensions for borderless
    // fullscreen (no launch overrides after reset), after autoconfig's mode pick.
    let fields = [
        ("cl_gib_allow", "1".into()),
        ("cl_particle_fallback_base", "0".into()),
        ("cl_particle_fallback_multiplier", "1".into()),
        ("cl_ragdoll_maxcount", "8".into()),
        ("cl_ragdoll_self_collision", "1".into()),
        ("mat_forceaniso", "2".into()),
        ("mat_mip_linear", "1".into()),
        (
            "stream_memory",
            texture_budget(hw.video_memory_mb, memory_level).to_string(),
        ),
        ("mat_picmip", "0".into()),
        ("particle_cpu_level", "0".into()),
        ("r_createmodeldecals", "1".into()),
        ("r_decals", "256".into()),
        ("r_lod_switch_scale", "1".into()),
        ("shadow_enable", "1".into()),
        ("shadow_depth_dimen_min", shadow_size.to_string()),
        ("shadow_depth_upres_factor_max", shadow_upres.to_string()),
        ("shadow_maxdynamic", "4".into()),
        ("dvs_enable", "1".into()),
        ("dvs_gpuframetime_min", dvs_min.to_string()),
        ("dvs_gpuframetime_max", dvs_max.to_string()),
        ("sound_volume", "1".into()),
        ("last_display_width", hw.desktop_width.to_string()),
        ("last_display_height", hw.desktop_height.to_string()),
        ("nowindowborder", "1".into()),
        ("fullscreen", "1".into()),
        ("defaultres", hw.desktop_width.to_string()),
        ("defaultresheight", hw.desktop_height.to_string()),
        ("volumetric_lighting", u8::from(gpu_level > 1).to_string()),
        ("volumetric_fog", "0".into()),
        ("mat_vsync_mode", "2".into()),
        ("mat_backbuffer_count", "2".into()),
        ("mat_antialias_mode", "12".into()),
        ("csm_enabled", "0".into()),
        ("csm_coverage", "2".into()),
        ("csm_cascade_res", "512".into()),
        ("fadeDistScale", "1".into()),
        ("new_shadow_settings", "1".into()),
        ("dynamic_streaming_budget", "1".into()),
        ("gamma", "1".into()),
        ("configversion", "10".into()),
        ("map_detail_level", "2".into()),
        ("ssao_quality", (gpu_level + 1).to_string()),
    ];
    let mut text = String::from("\"VideoConfig\"\r\n{\r\n");
    for (key, value) in fields {
        text.push_str(&format!("\t\"setting.{key}\"\t\t\"{value}\"\r\n"));
    }
    text.push_str("}\r\n");
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/game/apex_default_video.rs"
    ));
}
