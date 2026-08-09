# APEX Game Settings Runtime Mapping

This file records mappings observed from the live EA build of Apex Legends on
2026-07-29, 2026-07-30, and 2026-08-09. It supplements the screenshots and
prevents option values from being inferred from menu order alone.

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
| Ping opacity | `hud_setting_pingAlpha` | Default / Faded | `1.0` / `0.5` |
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

Changing jetpack/glide control in-game also sets
`toggle_on_jump_to_deactivate_changed` to `1`; MxTools mirrors that coupled
write. Laser color itself is stored as a packed integer, but the editor
intentionally exposes only Default and Custom because the color mapping was not
verified accurately.

## Mouse ADS sensitivity storage

The general ADS mouse sensitivity multiplier and the eight per-optic values
share `mouse_zoomed_sensitivity_scalar_0` through
`mouse_zoomed_sensitivity_scalar_7`. When per-optic sensitivity is disabled,
changing the general multiplier writes the same value to all eight keys. When
`mouse_use_per_scope_sensitivity_scalars=1`, the general control is disabled
and the eight keys are edited independently as 1x, 2x, 3x, 4x, 6x, 8x, 10x,
and Seer passive sensitivity.

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

## Recorded only: advanced look controls

The following in-game controller settings are recorded from the Advanced Look
Controls screen but intentionally remain outside the editable catalog. Their
complete ranges, steps, dependencies, and right-click tips were not verified:

- Custom look controls
- Deadzone
- Outer threshold
- Response curve
- Per-optic settings
- Yaw speed and pitch speed
- Turning extra yaw and pitch
- Turning ramp-up time and delay
- ADS yaw speed and pitch speed
- ADS turning extra yaw and pitch
- ADS turning ramp-up time and delay
- Target compensation and melee target compensation

## Partially observed; do not expose yet

| UI setting | Config key | Confirmed observation | Missing evidence |
| --- | --- | --- | --- |
| ADS look sensitivity | `gamepad_aim_speed_ads_0…7` | Labels are Same / Very low / Low / Default / High / Very high / Super high / Ultra high / Extreme with values `-1…7`; optic labels are 1x, 2x, 3x, 4x, 6x, 8x, 10x, and Seer passive | Whether general ADS writes one key or all eight, and the exact per-optic enable key |
| Audio mix | `miles_mix` plus `dialogue_cat_*` companions | Menu labels are Original / Focused; watcher saw `1 → 0`, and the final file contained `1` with changed dialogue-category values | Which value belongs to each label and the complete coupled writes |

The raw watcher log for this session is stored outside the repository in the
Codex visualization workspace. Telemetry timestamp-only changes are not setting
mappings and must be ignored.

## Retest protocol

For every partially observed setting, capture a fresh baseline, select exactly
one menu option, apply once, and diff both `profile.cfg` and `settings.cfg`.
Repeat for every option, then restore the baseline and verify any companion-key
writes. Only after the full option table and side effects are known should the
field be added to `src/data/apex_game_settings.ts` with matching frontend and
Rust validation tests. Menu order alone is never evidence of stored values.
