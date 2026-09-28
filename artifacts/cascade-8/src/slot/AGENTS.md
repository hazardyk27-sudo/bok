# Slot ownership

This directory is the Slot frontend ownership root.

Normal Slot work may modify this directory plus the Slot-owned config, engine, game, simulation and API roots declared in `.github/game-ownership.json`.

Slot work must not modify Roulette, Cadı Kazan, Idle, Hub, or shared/platform files.

The Slot route markup, controller bootstrap and Slot stylesheet are owned here. A Slot commit never publishes itself to Replit; only the central one-game promotion workflow may update the Slot slice of `integration/replit-preview`.

## Isolation v2 is active
- Work only on `feature/slot` and only inside Slot-owned roots from `.github/game-ownership.json`.
- Do not merge or push the whole feature branch into `integration/replit-preview`.
- Do not touch Replit. Replit stays on `integration/replit-preview`.
- A commit only saves Slot work. Preview release is a separate central promotion that copies only Slot-owned roots.
- If a task appears to require Hub, another game, wallet/platform, shared router/build/schema files, stop and hand it to the central integration conversation.

## Milestone continuity
- At the start of a new conversation, read this file and `Current milestones` once. Keep them in context and do not re-read them for each later command unless the rules/milestones actually changed or the conversation switches category/repository.
- Add a milestone only for durable state that the next agent would otherwise have to rediscover: an important decision, completed phase, validated baseline, major root cause/blocker, or next agreed checkpoint.
- Do not log routine micro-edits, every commit, raw test output, failed experiments, or temporary observations.
- Keep the list curated and short (normally 5–10 bullets), newest first. Replace or remove superseded items instead of appending forever.
- Preferred format: `YYYY-MM-DD — Milestone — current result/state. Next: ...`
- Before a meaningful handoff/new chat, update this section if the durable state changed.
- This milestone section belongs to Slot; updating it is allowed on `feature/slot` because this `AGENTS.md` is inside the category's owned root.
- If a note conflicts with code/tests/ownership rules, the validated repository state wins.

## Current milestones
- 2026-09-28 — Seven-symbol visible-board cap validation — Initial boards obey the 7-normal-symbol cap, but a 5M same-seed run found 76,605 refill boards over the cap (76,351 with 8 distinct, 254 with 9; max refill 9). Likely leak is a pending pair SECOND emission reusing a stale base symbol without rechecking the visible-symbol set. Do not treat the cap or 261.7626% RTP run as final until this refill path is fixed and revalidated.
- 2026-09-26 — Isolation v2 active — Slot development stays on `feature/slot`; preview release is ownership-scoped into `integration/replit-preview`, not a whole-branch merge.

