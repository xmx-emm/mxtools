# Game launch behavior

## Apex

- The FPS launch option and quick-preset `show_fps` share one catalog identifier
  and emit `+net_netGraph2 1` for Steam and EA.
- Unchecking it removes the launch override; it does not change an already saved
  Performance Display preference in `profile.cfg`.
- Existing `+cl_showfps` text and unsupported/partial options remain custom text.
  Custom user text is preserved, not treated as an old-version compatibility mode.
- Managed Miles channel choices are 2/6/8; the former channel-4 choice is removed.
- Default generation follows the current-only policy in `APEX_SETTINGS_COMPATIBILITY.md`.
  The version footer is advisory and does not gate reset operations.

## PUBG

- Graphics aliases serialize to one canonical token; conflicting graphics or
  window selections remain custom rather than assuming precedence.
- Windowed mode emits `-windowed`; existing `-window` and
  `-force-feature-level-11-0` text remain custom.
- Incomplete resolution/mouse groups, quoted values and unknown arguments survive
  the read/apply round trip. A refresh-rate request is not an FPS cap.
- Skip-intro behavior renames the Movies folder without consuming user-supplied
  `-nosplash` or `+noIntroCinematics` launch text.
- Saving a value does not establish its in-game effect; the UI keeps that warning.

## Tests and project boundary

Product regression tests cover catalog identity, serialization, custom-text
preservation and fresh-store readback. External analysis materials and detailed
reports belong to their own projects, not this repository. Historical parameter
changes are documentation only.
