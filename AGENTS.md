# OYUN repository operating rules

This repository contains multiple games that must be developed and released independently.

## Permanent branch model
- Slot work: `feature/slot`
- Roulette work: `feature/roulette`
- Cadı Kazan work: `feature/cadi-kazan`
- Idle / İşletmeler work: `feature/idle`
- Hub/site work: `feature/hub`
- Account/auth work: `feature/account`
- Blackjack work: `feature/blackjack`
- Shared Replit preview: `integration/replit-preview`
- Replit must stay on `integration/replit-preview`.

## Isolation rules
1. A game task may only modify files owned by that game in `.github/game-ownership.json`.
2. Never modify another game's owned files.
3. Shared/platform files are not part of a normal game update. If a shared file must change, stop and treat it as a separate platform change.
4. Committing to a feature branch does NOT publish to Replit.
5. Promotion to preview must use the game promotion workflow; do not merge an entire feature branch into the preview branch.
6. Promotion must preserve every non-target game's tree exactly.
7. No reset --hard, rebase, force-push, or branch switching in Replit.
8. Do not make design or behavior changes while performing structural isolation/refactors.
9. During refactors or infrastructure work, preserve the current working game's design and behavior unless the user explicitly asks for a behavior/design change.
10. If ownership is unclear, stop instead of touching a shared or foreign file.

## Goal
Routine Slot updates must have zero file changes in Roulette, Cadı Kazan, Idle, Hub and Account/Auth. The same isolation rule applies symmetrically to every game/category.


## Release workflow
Isolation layout v2 is active. Game agents only develop and commit inside their declared ownership. The central integration/release flow selects a game and source commit and promotes only that game's owned roots to `integration/replit-preview`. Do not manually merge a full feature branch into preview.


## Agent operating discipline
1. Before coding, verify the active branch matches the task and inspect working-tree status. If unrelated uncommitted changes exist, do not overwrite or absorb them.
2. Before editing, check the intended files against `.github/game-ownership.json`. Normal game work stays inside that game's owned/development roots.
3. Use mini-parts to prevent timeouts, not to create tiny busywork. One mini-part should be one coherent, meaningful checkpoint and may touch several tightly related owned files plus its relevant test. Do not split trivial adjacent edits into separate parts, and do not combine unrelated objectives or long exploratory work into one part.
4. Search narrowly first: inspect the target game's owned area and the smallest relevant code/log slice. Widen only when evidence requires it. Avoid dumping entire files, giant logs, or broad repository scans when targeted inspection is enough.
5. If the correct fix requires a shared/platform or foreign-game file, stop and hand that dependency to the central integration flow. Do not hide the dependency with a workaround, duplicate hack, or cross-game import.
6. Before each game commit, run the relevant targeted test/check and inspect the diff/file list. A normal game commit must contain only that game's allowed paths.
7. Refactors, test work, isolation work, performance work, and backend work must not silently redesign UI, game rules, payouts, physics, or user-visible behavior.


## Preview / Replit protocol
- A preview request follows this order: finish and commit the game change on its feature branch; promote only that game's owned roots to `integration/replit-preview` through the one-game promotion flow; then refresh Replit's existing integration branch.
- Do not connect to Replit first and do not ask Replit Agent routine status/debugging questions.
- For the normal Replit refresh, give the user a short shell snippet that uses remote `github`, verifies the current branch is already `integration/replit-preview`, performs only a fast-forward merge from `github/integration/replit-preview`, then prints branch/sync/status checks.
- State the exact success criteria with the snippet: branch must print `integration/replit-preview`; ahead/behind must print `0 0`; working-tree status must print nothing.
- Never use reset --hard, rebase, force-push, or feature-branch switching in Replit.
- Query Replit only when the user's shell output shows an error, wrong branch, non-clean tree, non-fast-forward/ahead-behind problem, or when the user explicitly asks for Replit-side diagnosis.


## General game delivery protocol
This protocol is mandatory for every game/category. Before commit, promotion, or Replit work, read `GAME_DELIVERY_PROTOCOL.md`.

The repository has three separate lanes:
1. **Development lane** — work and commits stay on the category's `feature/*` branch. Default rule: one active writer per feature branch. If the remote feature HEAD changes unexpectedly during a task, stop, fetch, inspect the new commits, and reconcile deliberately; never blind-merge, overwrite, or force-push. Parallel writers for the same game must use separate temporary task branches.
2. **Promotion lane** — routine game releases reach `integration/replit-preview` only through the serialized one-game promotion workflow, using an immutable source commit SHA. Game agents and Replit must never manually merge/push routine game commits into the integration branch.
3. **Replit lane** — Replit is a read-only consumer of `integration/replit-preview`. Replit never creates product commits and never pushes to GitHub. Normal refresh is fetch + fast-forward only through `scripts/replit-sync-preview.sh`.

Race handling is fail-safe: if a feature branch or preview branch moves while an operation is in progress, abort/re-run from the newest verified HEAD instead of automatically merging unrelated work. A successful preview sync must prove both that Replit matches the current remote preview and, when an expected promoted preview SHA is supplied, that this SHA is an ancestor of the running HEAD.


## Milestone continuity
- At the start of a game/category task, read the closest owned `AGENTS.md` and its `Current milestones` section before changing code.
- Record a milestone only when it materially changes what the next agent needs to know: a durable architecture/behavior decision, a completed phase, a validated baseline, a significant blocker/root cause, or the next agreed checkpoint.
- Game agents update milestones only in their own game/category `AGENTS.md`. Shared/platform/integration milestones are maintained only by the central integration flow in this root `AGENTS.md`.
- Keep milestones curated, not chronological noise: newest first, normally 5–10 bullets maximum, replace/remove superseded items, and never paste raw logs, long failed experiments, or full chat history.
- Preferred format: `YYYY-MM-DD — Milestone — current result/state. Next: ...`
- Before ending a substantial task or handing work to a new chat, update the milestone section if the durable state changed. If nothing important changed, do not add a milestone.
- Code, tests, ownership manifest, and validated runtime behavior remain the source of truth if a milestone note becomes stale.

## Shared/platform current milestones
- 2026-09-27 — Blackjack category established — `feature/blackjack` owns isolated frontend, API and Blackjack schema roots; shared route/schema wiring remains a central integration responsibility. Next: build the isolated Blackjack skeleton and validate ownership CI.
- 2026-09-27 — Account/Auth category established — auth development is isolated on `feature/account` with owned frontend, API and DB-schema roots; shared route/schema wiring remains a central integration responsibility. Next: build and validate email/password auth foundation on the account branch.
- 2026-09-26 — Isolation v2 active — game work is branch- and ownership-scoped; preview promotion copies only the selected game's owned roots into `integration/replit-preview`.
- 2026-09-26 — Replit workflow normalized — Replit stays on `integration/replit-preview`; legacy `main` preview instructions are obsolete; normal refresh is fast-forward only.
