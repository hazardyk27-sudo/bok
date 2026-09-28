---
name: Workspace build boundary
description: Why the root game build does not recurse into sibling artifact packages.
---

The root Cascade 8 app is the user-facing product in this workspace. Its build intentionally runs the root Vite build after shared typechecking, while the pre-existing artifact packages retain their managed preview/build environment.

**Why:** sibling artifact Vite configs require artifact-only environment such as BASE_PATH; recursively building them from the generic workspace root can fail even when the product app is healthy.

**How to apply:** validate the root product with `pnpm run build`; validate managed sibling artifacts through their own workflows or artifact commands.