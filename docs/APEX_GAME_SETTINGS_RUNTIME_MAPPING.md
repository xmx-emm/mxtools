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
| Laser sight color | `laserSightColor` | Custom RGB | packed integer `R \| (G << 8) \| (B << 16)`, range `0..16777215` |
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
| Spectator game volume | `sound_volume_sfx_observer` | UI `0..100` | continuous stored value near `0..1` |
| Emote preview action sound | `cl_anim_always_play_nonlobby_sfx` | Off / On | `0` / `1` |
| Convert incoming voice to chat text | `speechtotext_enabled` | Off / On | `0` / `1` |
| Master volume | `setting.sound_volume` in `videoconfig.txt` | UI `0..100` | continuous stored value near `0..1` |
| Menu cursor speed | `gameCursor_Velocity` | unlabeled slider minimum / maximum | `1300` / `4300` |
| Energy ammo display | `hud_setting_energyAmmoDisplay` | Off / On | `0` / `1` |
| Medal display | `hud_setting_showMedals` | Off / On | `0` / `1` |
| UI mode | `ui_layout_mode` | Automatic / Compact / Full | `0` / `1` / `2` |

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

Legend, ping, and broadcast dialogue each use a two-key three-state mapping:

| UI option | `*_flavor` | `*_important` |
| --- | --- | --- |
| None | `0` | `0` |
| Important only | `0` | `1` |
| All | `1` | `1` |

The exact key pairs are `dialogue_cat_legend_flavor` / `_important`,
`dialogue_cat_ping_flavor` / `_important`, and
`dialogue_cat_host_flavor` / `_important` for the Broadcast dialogue row.
The spectator-game, SFX, dialogue, game-music, and lobby-music sliders all use
continuous stored values near `0..1`; displayed integer percentages may write
nearby six-decimal values. Incoming voice-chat volume instead exposes UI
`0..200` and stores approximately `0..2` in `sound_volume_voice`.

Observed slider examples from the 2026-08-17 sweep include SFX `20` ->
`0.198391`, dialogue `20` -> `0.198391`, game music `40` -> `0.402145`, lobby
music `60` -> `0.600536`, spectator game volume `86` -> `0.857909`, incoming
voice volume `80` -> `0.804290`, and incoming voice volume `200` -> `2.000000`.
An open-mic threshold displayed as `10014` stored `10014.579102`; these sliders
must preserve finite fractional values instead of rounding to the displayed
integer.

EA's official PC settings reference marks both incoming text-to-speech and
incoming voice-to-chat-text menu entries as English-only. Their profile keys
remain editable as `hudchat_play_text_to_speech` and `speechtotext_enabled`
with `0/1` values even when a non-English Apex UI hides those rows.

Changing jetpack/glide control in-game also sets
`toggle_on_jump_to_deactivate_changed` to `1`; MxTools mirrors that coupled
write. Laser color uses `packed = R + (G << 8) + (B << 16)`: RGB
`(255, 45, 13)` stored `863743`, and pure red stored `255`. Returning to Default
sets `laserSightColorCustomized=0` while preserving the last custom packed
value for later reuse. MxTools unpacks the three byte channels for editing and
writes the resulting packed decimal value.

## Laser-sight preview asset investigation

Static RSX inspection identified the in-game preview without launching Apex:

- `menu_laser_sight_options.ui.nut` selects
  `rui/menu/laser_options/laser_example_1` and passes `laserColor` to its RUI.
- The compiled UI image is `ui_image/rui/menu/laser_options/laser_example_1.rpak`
  in `ui.rpak`, GUID `a93b449455061efd`. The similarly named
  `ui/laser_sight_preview_bg.rpak` is the parameterized RUI wrapper, not the
  background pixels.
- `ui_main_menu.rpak` is only a small dependency container and does not hold the
  laser preview.

RSX exports that GUID as a 1170 x 640 PNG. The image contains the static room
and weapon only; the laser is not baked into its pixels. MxTools bundles a
downscaled 800 x 438 JPEG re-encode of that export at
`src/assets/images/apex/laser_sight_preview.jpg` (the release size budget
cannot absorb the lossless PNG) and overlays the currently edited RGB value as
a local CSS beam and impact glow, so preview updates remain immediate and do
not require Apex to be installed or running.

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
| Equip ordnance | `weaponSelectOrdnance` | held command `+strafe` |
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

The complete command catalog currently accepted by the settings editor is:

- Movement: `+moveleft`, `+moveright`, `+forward`, `+backward`, `+jump`,
  `+duck`, `+toggle_duck`, `+speed`, `+dodge`.
- Combat and abilities: `+attack`, `+reload`, `+melee`, `+zoom`,
  `+toggle_zoom`, `+weaponCycle` / `+weaponcycle`, `+ping`, `+offhand1`, `+offhand4`,
  `+scriptCommand3`, `+scriptcommand3`, `+scriptCommand4`,
  `+scriptCommand5`, `+scriptCommand6`, `+scriptCommand7`.
- Interaction and inventory: `+use; +use_long`, `+use_alt`, `weapon_inspect`,
  `weaponSelectOrdnance`, `toggle_inventory`, `toggle_map`,
  `weaponSelectPrimary0`, `weaponSelectPrimary1`, `weaponSelectPrimary2`.
- Consumables: `use_consumable HEALTH_SMALL`, `use_consumable HEALTH_LARGE`,
  `use_consumable SHIELD_SMALL`, `use_consumable SHIELD_LARGE`,
  `use_consumable PHOENIX_KIT`.
- Communication and marking: `+pushtotalk`, `say_team`, `chat_wheel`,
  `ping_specific_type ENEMY`, `ping_specific_type ATTACK`,
  `ping_specific_type REGROUP`, `ping_specific_type ENEMY_AUDIO`,
  `ping_specific_type AVOID`, `ping_specific_type AREA_VISITED`,
  `ping_specific_type WATCHING`, `ping_specific_type GOING`,
  `ping_specific_type LOOTING`, `ping_specific_type DEFENDING`.
- Capture and observer: `jpeg`, `screenshotDevNet`,
  `screenshotDevNet_noRPROF`, `in_spec_mode`, `in_spec_teamplayer1`,
  `in_spec_teamplayer2`, `in_spec_teamplayer3`, `in_spec_next`, `in_spec_prev`,
  `in_spec_next_team`, `in_spec_prev_team`, `in_spec_closest_player`,
  `in_spec_closest_enemy`, `in_spec_kill_leader`, `in_spec_altitude_lock`,
  `in_spec_last_attacker`, `in_spec_insert_annotation`,
  `in_spec_toggle_smoothcam`, `in_spec_toggle_map_teamnames`,
  `in_spec_toggle_obituary`, `in_spec_chasecam_zoom_out`,
  `in_spec_chasecam_zoom_in`, `in_spec_toggle_ui`, `in_spec_toggle_freecam`,
  `in_spec_toggle_chasecam_lock`, `toggle_obs_player_tags`,
  `toggle_obs_highlight`, `toggleconsole`, `ingamemenu_activate`,
  `miles_insert_bug_marker`, `toggle_obs_ring_survey`,
  `roamingcam_togglerollmode`, `+spectatorRollClockwise`,
  `+spectatorRollCounterClockwise`.

The current observed controller block also contains numbered `+ability 0..14`
and `+ability_held 0..14` pairs. Their inputs are `A_BUTTON`, `B_BUTTON`,
`X_BUTTON`, `Y_BUTTON`, shoulder/trigger, d-pad, and stick controls. They stay
visible in the raw capture but remain read-only in the keyboard/mouse editor.
The keyboard capture also confirmed `KP_INS`, `KP_ENTER`, `NUMLOCK`, and
`SCROLLLOCK` input names; the editor accepts and records these names directly.

The list describes the editor's known command surface, not a claim that every
command exists in every account's current `settings.cfg`. The report only shows
bindings present in the file; absent commands can be created from an existing
editable action template, while controller-button/stick/trigger inputs remain
read-only.

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

The current menu's input-device selector writes `voice_input_device`, while the
output-device selector writes `miles_output_device`. Both are Windows endpoint
IDs and remain excluded from snapshots. The current menu has no independent
microphone-input-volume, voice-enable, or voice-mute row; `voice_mixer_volume`,
`voice_enabled`, and `voice_mixer_mute` therefore remain outside editable menu
ownership. Top-level master volume writes `setting.sound_volume` in
`videoconfig.txt`; it is portable and editable. `local/voice_volumes.dat`
changed timestamps during exit but its bytes did not change with these global
controls.

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

In isolated point-light-shadow transitions, `setting.shadow_maxdynamic`
remained `0` and `setting.new_shadow_settings` remained `1`, so neither key is
part of the confirmed linked preset. A later full-settings sweep observed
`setting.shadow_maxdynamic` changing from `0` to `4`; the exact owning menu row
was not isolated. It remains an advanced field pending that evidence.

## Full-settings sweep follow-ups

- `dialogue_cat_weapon_flavor` changed from `1` to `0` during the advanced
  audio sweep and returned to `1` on reset. Its exact row or companion-write
  ownership remains pending, so it stays in Review later.
- Firing-range options produced no dedicated local configuration key in the
  watched text or binary files. Custom-match runtime mapping was not completed
  because a solo lobby could not start a match.
- The in-game full reset restored `gameCursor_Velocity=1300`,
  `ui_layout_mode=0`, `hud_setting_energyAmmoDisplay=1`,
  `hud_setting_showMedals=1`, and `setting.sound_volume=1`; reset also rewrote
  bindings and numerous ordinary menu values, so reset traffic is baseline
  evidence rather than a new setting mapping.

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
