# APEX Game Settings Runtime Mapping

This file records mappings observed from the live EA build of Apex Legends on
2026-07-29, 2026-07-30, 2026-08-09, 2026-08-10, and 2026-08-11. It supplements
the screenshots and prevents option values from being inferred from menu order
alone.

## Confirmed mappings

| UI setting | Config key | UI option | Stored value |
| --- | --- | --- | --- |
| Reticle color | `reticle_color` | Default | empty string |
| Reticle color | `reticle_color` | Custom | three decimal RGB integers, e.g. `210 190 17` |
| Laser sight color mode | `laserSightColorCustomized` | Default / Custom | `0` / `1` |
| Jetpack/glide control | `toggle_on_jump_to_deactivate` | Hold / Toggle | `0` / `1` |
| Subtitle size | `cc_text_size` | Normal / Large / Extra large | `0` / `1` / `2` |
| Health and ammo voice | `player_setting_gamestateawareness_callouts` | Off / Limited / On | `0` / `1` / `2` |
| Mantle boost activation | `mantle_boost_input_setting` | Off / Jump / Crouch / Movement ability | `0` / `1` / `2` / `3` |
| Mantle boost UI prompts | `mantle_boost_ui_setting` | Off / Minimum / Hidden prompts / Full | `0` / `1` / `2` / `3` |
| Low-health/ammo popup | `player_setting_lowammo_setting` | Off / Limited / On | `0` / `1` / `2` |
| Ping opacity | `hud_setting_pingAlpha` | Default / Transparent | `1.0` / `0.5` |
| Pilot damage indicator | `damage_indicator_style_pilot` | Off / X / X + shield | `0` / `1` / `2` |
| Damage indicator projection | `hud_setting_damageIndicatorStyle` | 2D / 3D / Both | `0` / `1` / `2` |
| Damage text display | `hud_setting_damageTextStyle` | Off / Stacking / Floating / Both | `0` / `1` / `2` / `3` |
| Auto-mute communications | `cl_comms_filter` | None / Non-friends / Everyone | `1` / `0` / `-1` |
| Controller preset | `gamepad_button_layout` | Default / Button Jumper / Button Puncher / Evolved / Grenadier / Ninja / Custom | `0` / `1` / `2` / `3` / `4` / `5` / `6` |
| Stick layout | `gamepad_stick_layout` | Default / Southpaw / Legacy / Legacy Southpaw | `0` / `1` / `2` / `3` |
| Look sensitivity | `gamepad_aim_speed` | Very low / Low / Default / High / Very high / Super high / Ultra high / Extreme | `0` / `1` / `2` / `3` / `4` / `5` / `6` / `7` |
| Response curve | `gamepad_look_curve` | Classic / Steady / Fine aim / High velocity / Linear | `0` / `1` / `2` / `3` / `4` |
| Look deadzone | `gamepad_deadzone_index_look` | None / Small / Large | `0` / `1` / `2` |
| Movement deadzone | `gamepad_deadzone_index_move` | Small / Large | `1` / `2` |
| Interact/reload button | `gamepad_use_type` | Tap use/hold reload / Hold use/tap reload / Tap use and reload | `0` / `1` / `2` |
| Trigger deadzone | `gamepad_trigger_threshold` | None / Default / Medium / High / Highest | `0` / `30` / `64` / `128` / `255` |
| Controller vibration | `joy_rumble` | Off / Default / Advanced | `0` / `1` / `2` |
| PS5 adaptive trigger effects | `ps5_trig_enable` | Off / On | `0` / `1` |
| Voice chat record mode | `VoiceChatMode` | Push-to-talk / Open mic / Toggle | `0` / `1` / `2` |
| Output configuration | `miles_channels` | Device default / Mono / Stereo | `0` / `1` / `2` |
| Audio mix | `miles_mix` | Original / Focused | `0` / `1` |

No runtime evidence supports exposing `hud_setting_pingAlpha` below `0.5`.

The open-mic recording threshold `voice_quiet_threshold` spans `0` through
`32767`. The in-game slider writes decimal values such as `1581.249390` and
`17218.048828`, so validation must preserve finite fractional values rather than
requiring integers.

The audio-channel selector writes `miles_channels`. The in-game label for value
`0` starts with "Device default", but its parenthesized suffix is resolved from
the active output device and system configuration. For example, the observed
device displayed "Device default (Stereo)"; "Stereo" is not a fixed part of
that option label. This is the actual key for the in-game selector;
`sound_num_speakers` values seen in older snapshots are not this selector.

The audio-mix selector writes only `miles_mix`: Original is `0` and Focused is
`1`. Controlled transitions did not modify any `dialogue_cat_*` value.

Changing jetpack/glide control in-game also sets
`toggle_on_jump_to_deactivate_changed` to `1`; MxTools mirrors that coupled
write. Laser color uses `packed = R + (G << 8) + (B << 16)`: RGB
`(255, 45, 13)` stored `863743`, and pure red stored `255`. Returning to Default
sets `laserSightColorCustomized=0` while preserving the last custom packed
value for later reuse.

## Mouse ADS sensitivity storage

The general ADS mouse sensitivity multiplier writes only
`mouse_zoomed_sensitivity_scalar_0`; it does not broadcast to the remaining
optic keys. `mouse_use_per_scope_sensitivity_scalars` stores the per-optic
toggle as `0/1`, and toggling it does not initialize or overwrite any scalar.
When it is `1`, the eight keys are edited independently. All slots were changed
and directly confirmed: `_0` through `_7` are 1x, 2x, 3x, 4x, 6x, 8x, 10x,
and Seer passive respectively. Changing `_3` through `_6` did not modify any
other optic scalar.

Mouse values are continuous numeric scalars rather than controller presets.
The menu label and stored float are not a one-to-one decimal identity: observed
UI `1.00` selections produced `0.988204` and `1.014477` from opposite
directions, while UI `1.10` produced `1.093298`.

## Controller ADS sensitivity storage

The general controller ADS selector writes only `gamepad_aim_speed_ads_0`.
`gamepad_use_per_scope_ads_settings` stores the per-optic toggle as `0/1`.
When the toggle is enabled, the eight independent slots are:

| Slot | Optic |
| --- | --- |
| `_0` | 1x optic / iron sights |
| `_1` | 2x optic |
| `_2` | 3x optic |
| `_3` | 4x optic |
| `_4` | 6x optic |
| `_5` | 8x optic |
| `_6` | 10x optic |
| `_7` | Seer passive |

Every selector uses the same nine stored values: `-1` is Same on the general
selector and Default on each per-optic selector; `0..7` are Very low, Low,
Default preset, High, Very high, Super high, Ultra high, and Extreme.

## Keyboard and mouse binding commands

The before/after reset snapshots confirmed these non-obvious bindings:

| UI action | Primary command | Paired or alternate command |
| --- | --- | --- |
| Movement ability | `+dodge` | contexts `0` and `1` are the two binding slots |
| Toggle fire mode | `+scriptCommand3` or lowercase `+scriptcommand3` | none |
| Equip survival item | `+scriptCommand6` | none |
| Use selected health item | `+scriptCommand4` | held command `+scriptCommand2` |
| Character utility action | `+scriptCommand5` | contexts `0` and `1` are the two binding slots |

APEX rewrites some binding command casing and may briefly truncate
`settings.cfg` while saving. Watchers must compare complete binding lines and
ignore a transient remove-all/add-all cycle.

MxTools presents each editable action as exactly two binding slots. Binding
changes are written as explicit create, update, or delete mutations so clearing
one slot does not remove the other. Before writing, the backend rejects a third
slot for the same command/held-command action and rejects any input already used
by another binding. Creating or deleting a binding with an adjacent
`bind_held_US_standard` line always keeps that pair together.

## Quick preset game-setting optimizations

The quick-preset window applies these runtime-confirmed profile values when
their checkboxes are enabled:

| Behavior | Key | Value |
| --- | --- | --- |
| Keep the death box/crafting menu open after damage | `player_setting_damage_closes_deathbox_menu` | `0` |
| Always sprint | `player_setting_stickysprintforward` | `1` |
| Auto sprint | `player_setting_autosprint` | `1` |
| Rotate minimap | `hud_setting_minimapRotate` | `1` |
| Disable subtitles | `closecaption` | `0` |

The same transaction removes `MOUSE2` from `+toggle_zoom`, assigns `MOUSE2` to
`+zoom`, removes wheel inputs from `+weaponCycle`, assigns `MWHEELUP` to
`+forward`, and assigns `MWHEELDOWN` to `+jump`. It preserves the other slot for
each action and still enforces the two-slot/global-conflict rules.

`hud_setting_pingAlpha` remains excluded from this preset because it is a HUD
preference rather than a launch optimization; its confirmed values are
documented in the mapping table above.

## Machine-local settings excluded from snapshots

Hardware endpoint identifiers are not portable between Windows devices. Apex
snapshot import and export therefore always omit these observed keys, even when
they appear in `settings.cfg`:

- `miles_output_device` (audio output device)
- `voice_input_device` (voice recording/input device)

No separate, verified Apex key for another “audio input device” selector was
observed in this session. Do not add or transfer one by name inference; record
its exact key first during a future runtime pass.

## Advanced Look Controls

The Advanced Look Controls master switch is `gamepad_custom_enabled` (`0/1`).
When it is off, the other confirmed ALC editors are disabled. The basic control
ranges are:

| UI setting | Config key | Stored range |
| --- | --- | --- |
| Deadzone | `gamepad_custom_deadzone_in` | `0..0.5` (0%–50%) |
| Outer threshold | `gamepad_custom_deadzone_out` | `0.01..0.3` (1%–30%) |
| Response curve | `gamepad_custom_curve` | `0..30` |

Percentage slider selections may store nearby finite floats; for example, a
displayed 15% deadzone produced `0.151475`.

The ALC per-optic switch is
`gamepad_use_per_scope_sensitivity_scalars` (`0/1`). Toggling it does not
initialize or overwrite any scalar. The eight independent scalar keys are
`gamepad_ads_advanced_sensitivity_scalar_0..7`; they map to 1x, 2x, 3x, 4x,
6x, 8x, 10x, and Seer passive in that order. Each accepts `0.2..10`. The menu
slider can store nearby finite floats instead of the displayed decimal; for
example, a displayed `2.0` produced values including `1.960322`, `1.986595`,
and `2.012869`. Each scalar editor is disabled when either the ALC master or
the ALC per-optic switch is off.

The movement controls map as follows:

| UI setting | Config key | Stored range |
| --- | --- | --- |
| Yaw speed | `gamepad_custom_hip_yaw` | `0..500` |
| Pitch speed | `gamepad_custom_hip_pitch` | `0..500` |
| Turning extra yaw | `gamepad_custom_hip_turn_yaw` | `0..250` |
| Turning extra pitch | `gamepad_custom_hip_turn_pitch` | `0..250` |
| Turning ramp-up time | `gamepad_custom_hip_turn_time` | `0..1` (0%–100%) |
| Turning ramp-up delay | `gamepad_custom_hip_turn_delay` | `0..1` (0%–100%) |
| ADS yaw speed | `gamepad_custom_ads_yaw` | `0..500` |
| ADS pitch speed | `gamepad_custom_ads_pitch` | `0..500` |
| ADS turning extra yaw | `gamepad_custom_ads_turn_yaw` | `0..250` |
| ADS turning extra pitch | `gamepad_custom_ads_turn_pitch` | `0..250` |
| ADS turning ramp-up time | `gamepad_custom_ads_turn_time` | `0..1` (0%–100%) |
| ADS turning ramp-up delay | `gamepad_custom_ads_turn_delay` | `0..1` (0%–100%) |

Target compensation is `gamepad_custom_assist_on` (`0/1`), and melee target
compensation is `gamepad_aim_assist_melee` (`0/1`). Turning target
compensation off disables the melee control. That transition did not change
`gamepad_custom_assist_style` or the four high/low-power scope aim-assist keys.
Those five keys, together with `gamepad_custom_pilot` and
`gamepad_custom_titan`, have no confirmed visible menu ownership and remain
outside the editable catalog.

## Current-menu ownership exclusions

- The visible Performance Display row writes `net_netGraph2` (`0/1`).
  `hud_setting_showMeter` remained unchanged and no current visible menu row
  for it was found, so it stays outside the editable catalog.
- The current Advanced Audio menu exposes output configuration through
  `miles_channels`; no visible speaker-count row owns `sound_num_speakers`, so
  that legacy key stays outside the editable catalog.
- No current visible menu row was found for `setting.volumetric_fog` or
  `setting.mat_depthfeather_enable`; both remain advanced, non-game settings.

The raw watcher log for this session is stored outside the repository in the
Codex visualization workspace. Telemetry timestamp-only changes are not setting
mappings and must be ignored.

## Confirmed video mappings

Adaptive-resolution target `60` writes `dvs_enable=1`, minimum frame time
`15834`, and maximum frame time `16333`; target `100` writes `1`, `9500`, and
`9800`. Target `0` writes only `dvs_enable=0` and retains the last frame-time
limits. While the target is nonzero, Apex disables the Double Buffered VSync
option. `setting.dvs_supersample_enable` was absent and was not written by the
current menu.

| VSync option | `setting.mat_vsync_mode` | `setting.mat_backbuffer_count` |
| --- | --- | --- |
| Disabled | `0` | `1` |
| Double buffered | `1` | `1` |
| Triple buffered | `2` | `2` |
| Adaptive | `3` | `1` |
| Adaptive (1/2 refresh rate) | `4` | `1` |

The current Map Detail menu exposes only Low=`1` and High=`2`; values `0`, `3`,
and `4` are not menu options. The Chinese UI label is `地图详情`.

Point Light Shadow Detail writes exactly three keys:

| Option | `shadow_enable` | `shadow_depth_dimen_min` | `shadow_depth_upres_factor_max` |
| --- | --- | --- | --- |
| Disabled | `0` | `0` | `0` |
| Low | `1` | `128` | `2` |
| High | `1` | `256` | `2` |
| Very high | `1` | `256` | `3` |
| Ultra | `1` | `512` | `3` |

`setting.shadow_maxdynamic` remained `0` and `setting.new_shadow_settings`
remained `1` through every selection, so neither key belongs to this linked
preset. `setting.shadow_maxdynamic` remains available only as an advanced,
non-game-setting field.

Effects Detail exposes only Low, Medium, and High. Their
`particle_cpu_level` / `cl_particle_fallback_base` /
`cl_particle_fallback_multiplier` tuples are `0/3/2`, `1/0/1.75`, and `2/0/1`.
The previous custom ultra-low tuple is not a current in-game menu option and is
not exposed as a normal preset.

## Retest protocol

For every future setting that still lacks a complete mapping, capture a fresh baseline, select exactly
one menu option, apply once, and diff both `profile.cfg` and `settings.cfg`.
Repeat for every option, then restore the baseline and verify any companion-key
writes. Only after the full option table and side effects are known should the
field be added to `src/data/apex_game_settings.ts` with matching frontend and
Rust validation tests. The user performs every live Apex selection manually;
automation remains limited to read-only config capture and comparison. Menu
order alone is never evidence of stored values.
