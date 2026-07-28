# Project Agent Guide

Before reading or searching source code, read `PROJECT_CONTEXT.md`.
Use it to choose the smallest relevant scope, then verify every important
claim against current source files because the summary never overrides code.

Keep changes scoped to the requested workflow. Preserve unrelated changes in
this frequently dirty worktree. Use `apply_patch` for manual edits and do not
run repository-wide formatting unless explicitly requested.

When architecture, dependencies, build behavior, or durable workflow knowledge
changes, refresh `PROJECT_CONTEXT.md` in the same task. Before a commit, ensure
the context describes the committed tree and include it when changed.
