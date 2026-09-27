# Cadı Kazan ownership

This directory is the Cadı Kazan frontend ownership root.

Cadı Kazan work may modify this directory and the Cadı Kazan API root declared in `.github/game-ownership.json`.

Cadı Kazan work must not modify Slot, Roulette, Idle, Hub, or shared/platform files during a normal game update.

The scratch system, styles, route mount, client, and Cadı-specific audio runtime are owned here. A Cadı Kazan commit does not publish itself to Replit; only the central one-game promotion workflow may update the Cadı Kazan slice of `integration/replit-preview`.

## Isolation v2 is active
- Work only on `feature/cadi-kazan` and only inside Cadı Kazan-owned roots from `.github/game-ownership.json`.
- Do not merge or push the whole feature branch into `integration/replit-preview`.
- Do not touch Replit. Replit stays on `integration/replit-preview`.
- A commit only saves Cadı Kazan work. Preview release is a separate central promotion that copies only Cadı Kazan-owned roots.
- If a task appears to require Hub, another game, wallet/platform, shared router/build/schema files, stop and hand it to the central integration conversation.

## Milestone continuity
- Read `Current milestones` before starting substantial work in this category.
- Add a milestone only for durable state that the next agent would otherwise have to rediscover: an important decision, completed phase, validated baseline, major root cause/blocker, or next agreed checkpoint.
- Do not log routine micro-edits, every commit, raw test output, failed experiments, or temporary observations.
- Keep the list curated and short (normally 5–10 bullets), newest first. Replace or remove superseded items instead of appending forever.
- Preferred format: `YYYY-MM-DD — Milestone — current result/state. Next: ...`
- Before a meaningful handoff/new chat, update this section if the durable state changed.
- This milestone section belongs to Cadı Kazan; updating it is allowed on `feature/cadi-kazan` because this `AGENTS.md` is inside the category's owned root.
- If a note conflicts with code/tests/ownership rules, the validated repository state wins.

## Current milestones
- 2026-09-27 — The Office server outcome engine — 10,000-roll paytable locks Kevin 2x @25%, Jim 5x @5%, Dwight 10x @1%, Stanley 20x @0.30%, Michael Scott 100x @0.05%; loss 68.65%, theoretical RTP 96%. Generator creates exactly three winning symbols or loss boards with no triple. Next: wire OFFICE_MATCH_6 into round persistence/reveal settlement.
- 2026-09-27 — The Office 6-cell match card scaffold — 3×2 board, 3-of-a-kind rule, 96% RTP target, and symbol ladder Kevin 2x / Jim 5x / Dwight 10x / Stanley 20x / Michael Scott 100x are locked in config. Outcome weights and live card wiring remain for the next parts.
- 2026-09-26 — Isolation v2 active — Cadı Kazan development stays on `feature/cadi-kazan`; preview release is ownership-scoped into `integration/replit-preview`, not a whole-branch merge.

