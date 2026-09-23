---
name: Temporary workflow isolation
description: How custom isolated preview processes interact with the shared root workflow configuration.
---

Custom workflows created for a `/tmp` worktree can write their launch entries into the shared root `.replit`, even when every application source file stays outside the workspace.

**Why:** A feature preview may need its own frontend/API processes, but persisting their launchers makes an otherwise clean shared `main` tree appear modified and can replace the normal run button.

**How to apply:** Prefer isolated processes for verification. If a user-facing preview workflow is required, explain that the runtime launcher changes root configuration; otherwise restore `.replit` after validation and report the isolated worktree/process locations.