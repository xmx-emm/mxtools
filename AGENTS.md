# Project Agent Guide

For GitHub Releases, asset order is a product rule: upload the Chinese-labeled
portable executable first, the Chinese-labeled installer second, and only then
signatures, updater manifests, or other auxiliary assets. Upload each asset in
its own sequential command; do not pass the complete asset list to one
concurrent upload command, because GitHub may display assets in creation order.

For architecture, cross-module, build/package, handoff, or explicitly requested
context work, read `PROJECT_CONTEXT.md` before source. For a self-contained
local, read-only, or documentation-only task, read only the relevant files and
use the context when it affects scope. Verify every important claim against
current source files because the summary never overrides code.

Keep changes scoped to the requested workflow. Preserve unrelated changes in
this frequently dirty worktree. Use `apply_patch` for manual edits and do not
run repository-wide formatting unless explicitly requested.

When architecture, dependencies, build behavior, or durable workflow knowledge
changes, refresh `PROJECT_CONTEXT.md` in the same task. Before a commit, ensure
the context describes the committed tree and include it when changed.

## State and cross-window communication

- Do not use Web Storage (`localStorage` or `sessionStorage`) anywhere in the
  project, including inline HTML and public scripts.
- Persist frontend state through Pinia stores backed by `@tauri-store/pinia`.
- Send transient cross-window updates through Tauri events or native IPC; do
  not use a persistence layer as a message bus.
- Code that runs before Pinia starts must use deterministic defaults, system
  preferences, URL parameters, or an explicit native bootstrap command.

## Response output

- Do not output transaction records, synthetic baseline/modified/rollback
  ledgers, artifact manifests, or process-accounting details unless the user
  explicitly requests them. Report only the requested work and concise,
  relevant completion evidence.

## Test organization

- Put every standalone frontend and script test under the root `tests/`
  directory, mirroring its production path as `tests/src/...` or
  `tests/scripts/...`; do not place `*.test.*` files beside production modules.
- Put standalone Rust test modules under `tests/rust/` and mount private-module
  tests from their production owner with a minimal test-only `include!` block.
  Existing inline `#[cfg(test)]` modules do not require unrelated extraction
  from their owning Rust module.
- Give each independently owned feature or workflow a focused test file. Do not
  append new feature coverage to a broad omnibus test file when it can be tested
  separately.
- Existing inline or omnibus tests do not require an unrelated bulk migration.
  When changing behavior they already cover, move that behavior's assertions
  into its focused test file. Extract shared test helpers only when multiple
  focused files reuse them.

## UI consistency rules

- Treat the existing Apex video-config segmented control as the canonical
  appearance for compact segmented buttons across MxTools. Apex and PUBG must
  not use different geometry or selected-state colors for the same interaction.
- Use the semantic control tokens from `src/assets/styles/global.css`: compact
  tool controls are 28 px, dialog actions are 32 px, and standard form fields
  are 40 px. Do not introduce a new fixed height when one of these roles applies.
- Every compact `v-btn-toggle` must use `game-page-segmented-toggle` together
  with `color="primary"`, `variant="text"`, `border`, `divided`, and compact
  density; its buttons use the small size where declared individually. The
  shared class, not `density`, `size`, or an inline `max-height` alone, owns the
  final 28 px group and button height.
- Keep the shared 4 px radius, divided border, hover, focus, disabled, and blue
  primary selected state. Do not add pill radii, page-local active backgrounds,
  or per-option error/pink colors to indicate a normal selected value. Reserve
  error color for genuinely destructive or invalid actions and keep requirement
  warnings in tooltips or validation text.
- Every user-facing `mdi-*` name referenced by a template must be imported and
  mapped in `src/icons/mdi-icons.ts`. When changing an action group, audit every
  icon in that component family against the registry so a declared icon cannot
  silently render as missing.
- When changing a repeated control, search all instances only when the control
  is shared by, or its contract explicitly covers, multiple pages or games.
  For a local control, keep the change and verification local. Compare Apex
  and PUBG equivalents only when both implement the same interaction contract;
  run the smallest affected lint/check plus `git diff --check` before reporting
  the UI change complete.
