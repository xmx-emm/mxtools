# APEX Game Settings Runtime Mapping

This file records mappings observed from the live EA build of Apex Legends on
2026-07-29. It supplements the screenshots and prevents option values from
being inferred from menu order alone.

## Confirmed mappings

| UI setting | Config key | UI option | Stored value |
| --- | --- | --- | --- |
| Reticle color | `reticle_color` | Default | empty string |
| Reticle color | `reticle_color` | Custom | three decimal RGB integers, e.g. `210 190 17` |
| Laser sight color mode | `laserSightColorCustomized` | Default / Custom | `0` / `1` |
| Jetpack/glide control | `toggle_on_jump_to_deactivate` | Hold / Toggle | `0` / `1` |
| Subtitle size | `cc_text_size` | Normal / Large / Extra large | `0` / `1` / `2` |
| Health and ammo voice | `player_setting_gamestateawareness_callouts` | Off / Limited / On | `0` / `1` / `2` |
| Auto-mute communications | `cl_comms_filter` | None / Non-friends / Everyone | `1` / `0` / `-1` |

Changing jetpack/glide control in-game also sets
`toggle_on_jump_to_deactivate_changed` to `1`; MxTools mirrors that coupled
write. Laser color itself is stored as a packed integer, but the editor
intentionally exposes only Default and Custom because the color mapping was not
verified accurately.

## Partially observed; do not expose yet

| UI setting | Config key | Confirmed observation | Missing evidence |
| --- | --- | --- | --- |
| Mantle boost activation | `mantle_boost_input_setting` | Jump was stored as `1`; a later unidentified option wrote `0` | Crouch, movement ability, and off values |
| Mantle boost UI | `mantle_boost_ui_setting` | Full was stored as `3`; a later unidentified option wrote `0` | Hidden prompts, minimum, and off values |
| Health/ammo popup | `hud_setting_showMeter` | On was stored as `1` | Off and limited values |
| Ping opacity | `hud_setting_pingAlpha` | Default was stored as `1.0` | Transparent value |

The raw watcher log for this session is stored outside the repository in the
Codex visualization workspace. Telemetry timestamp-only changes are not setting
mappings and must be ignored.
