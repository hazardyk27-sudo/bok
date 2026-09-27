# Roulette ownership

This directory is the Roulette frontend ownership root.

Roulette work may modify this directory and the other Roulette roots declared in `.github/game-ownership.json` (Roulette API/physics/config/scripts).

Roulette work must not modify:
- Slot-owned files
- Cadı Kazan-owned files
- Idle/İşletmeler-owned files
- Hub-owned files
- shared/platform files during a normal Roulette update

A Roulette commit never publishes itself to Replit. Only the central one-game promotion workflow may update the Roulette slice of `integration/replit-preview`.

## Isolation v2 is active
- Work only on `feature/roulette` and only inside Roulette-owned/development roots from `.github/game-ownership.json`.
- Do not merge or push the whole feature branch into `integration/replit-preview`.
- Do not touch Replit. Replit stays on `integration/replit-preview`.
- A commit only saves Roulette work. Preview release is a separate central promotion that copies only Roulette-owned roots.
- If a task appears to require Hub, another game, wallet/platform, shared router/build/schema files, stop and hand it to the central integration conversation.

## Milestone continuity
- Read `Current milestones` before starting substantial work in this category.
- Add a milestone only for durable state that the next agent would otherwise have to rediscover: an important decision, completed phase, validated baseline, major root cause/blocker, or next agreed checkpoint.
- Do not log routine micro-edits, every commit, raw test output, failed experiments, or temporary observations.
- Keep the list curated and short (normally 5–10 bullets), newest first. Replace or remove superseded items instead of appending forever.
- Preferred format: `YYYY-MM-DD — Milestone — current result/state. Next: ...`
- Before a meaningful handoff/new chat, update this section if the durable state changed.
- This milestone section belongs to Roulette; updating it is allowed on `feature/roulette` because this `AGENTS.md` is inside the category's owned root.
- If a note conflicts with code/tests/ownership rules, the validated repository state wins.

## Current milestones
- 2026-09-27 — Exact GLB Part 4A launch/settle gate closed — Exact GLB surface placement plus `normal × radial` launch tangent at the validated 5.0 m/s ±0.15 band now passes the 7-seed settle gate 7/7 (61001, 61004, 61005, 61006, 61007, 61008, 61022), with browser/server launch math mirrored and no hidden geometry. Next: Part 4B runs the broader 20-seed/full regression and closes the milestone if clean.
- 2026-09-26 — Isolation v2 active — Roulette development stays on `feature/roulette`; preview release is ownership-scoped into `integration/replit-preview`, not a whole-branch merge.

