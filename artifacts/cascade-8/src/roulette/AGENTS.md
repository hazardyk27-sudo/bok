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
- 2026-09-27 — Exact GLB Part 5 hidden-collider cleanup closed — Browser full-spin and server simulation now hard-fail unless the active environment collider roles are exactly `exact-glb-stationary-trimesh` + `exact-glb-rotor-trimesh`; browser additionally requires `legacyColliderCount=0`. Dedicated workflow `Roulette Part 5 Exact GLB Collider Contract` passed source assertions, server runtime probe, and 5-seed browser regression with all five seeds settled/safe. Evidence: workflow run 36284802787; contract code commit `9389aad349accf68d89e119bd5cbb41e8403ea68`; gate fix head `14507f9cb87e6614b4bf602ba69b59b1f075aa0e`. No invisible wall/bridge/floor/fret/guard/support collider is active in the full-spin path. Next: Part 6 micro-parity/contact-surface validation on the exact-GLB-only world.
- 2026-09-27 — Exact GLB Part 4A/4B containment + settle baseline closed — Exact GLB surface placement plus mirrored browser/server `normal × radial` launch tangent at 5.0 m/s ±0.15 passes the 7-seed settle gate 7/7 and the dedicated Part 4B 20-seed gate 20/20 (61001–61020). Every 20-seed case settled with a non-null pocket result and `safetyPassed=true`; no escape, clipping, tunneling, velocity spike, artificial acceleration, or timeout was observed. Evidence: workflow run 36284003696 on commit `72aecd4ef11d4840d384da9a7910c7d7c30ca929`. The separate 5-lap calibration gate is a tuning criterion, not a Part 4B containment blocker. Next: continue Part 5 from this exact-GLB baseline.
- 2026-09-26 — Isolation v2 active — Roulette development stays on `feature/roulette`; preview release is ownership-scoped into `integration/replit-preview`, not a whole-branch merge.

