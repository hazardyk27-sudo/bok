# Slot ownership

This directory is the Slot frontend ownership root.

Normal Slot work may modify this directory plus the Slot-owned config, engine, game, simulation and API roots declared in `.github/game-ownership.json`.

Slot work must not modify Roulette, Cadı Kazan, Idle, Hub, or shared/platform files.

The Slot route markup, controller bootstrap and Slot stylesheet are owned here. A Slot commit never publishes itself to Replit; only the central one-game promotion workflow may update the Slot slice of `integration/replit-preview`.

## Milestone continuity
- Read `Current milestones` before starting substantial work in this category.
- Add a milestone only for durable state that the next agent would otherwise have to rediscover: an important decision, completed phase, validated baseline, major root cause/blocker, or next agreed checkpoint.
- Do not log routine micro-edits, every commit, raw test output, failed experiments, or temporary observations.
- Keep the list curated and short (normally 5–10 bullets), newest first. Replace or remove superseded items instead of appending forever.
- Preferred format: `YYYY-MM-DD — Milestone — current result/state. Next: ...`
- Before a meaningful handoff/new chat, update this section if the durable state changed.
- This milestone section belongs to Slot; updating it is allowed on `feature/slot` because this `AGENTS.md` is inside the category's owned root.
- If a note conflicts with code/tests/ownership rules, the validated repository state wins.

## Current milestones
- 2026-09-26 — Isolation v2 active — Slot development stays on `feature/slot`; preview release is ownership-scoped into `integration/replit-preview`, not a whole-branch merge.

