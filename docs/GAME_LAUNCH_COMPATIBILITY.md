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

### September 30, 2026 review

The installed Steam J44 / `v3.0.2.44` / Build `25522636` uses
`EAAntiCheat.GameServiceLauncher.exe -steam`; Steam metadata still enables custom
launch arguments. The 17 managed groups cover 22 parameter names. All names remain
present, and the 12 managed ConVars retain their J28 registration defaults, flags,
help and declared bounds. This does not verify every parameter's in-game effect.
`-high` still lacks a confirmed consumer, and `mat_letterbox_aspect_goal` retains
its existing development-only flag; neither is a newly established J44 regression.

`reticle_color` is still registered. On 2026-10-01 the user confirmed on the
current Steam client that the hyphenated launch value produces a usable
transparent reticle. This confirms the Steam launch/effect path only; it does
not verify EA or other Apex settings. The current color callback converts floats to int32 before its final RGB bounds handling;
those bounds alone do not prove that the oversized legacy value is newly rejected.
Do not claim that Javelin blocked the option, remove it, or substitute another
oversized value without reproducing the behavior. Serialization/readback tests do
not establish compatibility for other settings. The exact Steam J44 build is
labeled as statically reviewed in the launch footer; configuration footers remain unverified.
The current real-device experiment emits the hyphenated RGB syntax: Steam uses
quotes around the value, while EA keeps the historical unquoted form. The
space-separated spelling remains readable for comparison and rollback.

A deeper check of the current equal-channel path found no upper clamp in its
HSV helper. An independent SSE reproduction, after successful RGB parsing and
under default masked-exception/rounding conditions, produces RGB zero from the
legacy oversized input; ordinary zero is raised to 128. A traced palette reader
normalizes that zero without raising it again. The palette's fourth integer is
an override-enabled flag, not alpha. Old J57 menu scripts already imposed input
and brightness limits, but no comparable old native callback body was retained.
These findings do not establish a newly added clamp or the final transparency.

The separate Beta startup-repair workflow still checks old EAC files, services and
logs. It can report missing EAC on a normal Javelin installation and has not been
adapted to repair Javelin. This is a known product limitation, not a diagnosis of
the reported reticle issue. The local EA installation remains J57, so this review
does not establish EA J44 compatibility.

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
