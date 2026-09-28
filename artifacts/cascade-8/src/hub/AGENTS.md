# Hub ownership

This directory belongs only to the main game selector / site hub.

- Hub work may modify files in this directory.
- Hub work must not modify Slot, Roulette, Cadı Kazan or Idle-owned files.
- Normal Hub work must not modify shared/platform files.
- Commit does not mean publish; preview promotion is handled centrally.

## Isolation v2 is active
- Work only on `feature/hub` and only inside Hub-owned roots from `.github/game-ownership.json`.
- Do not merge or push the whole feature branch into `integration/replit-preview`.
- Do not touch Replit. Replit stays on `integration/replit-preview`.
- A commit only saves Hub work. Preview release is a separate central promotion that copies only Hub-owned roots.
- If a task appears to require a game, wallet/platform, shared router/build/schema files, stop and hand it to the central integration conversation.

## Milestone continuity
- At the start of a new conversation, read this file and `Current milestones` once. Keep them in context and do not re-read them for each later command unless the rules/milestones actually changed or the conversation switches category/repository.
- Add a milestone only for durable state that the next agent would otherwise have to rediscover: an important decision, completed phase, validated baseline, major root cause/blocker, or next agreed checkpoint.
- Do not log routine micro-edits, every commit, raw test output, failed experiments, or temporary observations.
- Keep the list curated and short (normally 5–10 bullets), newest first. Replace or remove superseded items instead of appending forever.
- Preferred format: `YYYY-MM-DD — Milestone — current result/state. Next: ...`
- Before a meaningful handoff/new chat, update this section if the durable state changed.
- This milestone section belongs to Hub; updating it is allowed on `feature/hub` because this `AGENTS.md` is inside the category's owned root.
- If a note conflicts with code/tests/ownership rules, the validated repository state wins.

## Current milestones
- 2026-09-26 — Isolation v2 active — Hub development stays on `feature/hub`; preview release is ownership-scoped into `integration/replit-preview`, not a whole-branch merge.

