# OYUN repository operating rules

This repository contains multiple games that must be developed and released independently.


## Conversation/session initialization
- On the first OYUN/repository task in a new conversation, read and understand the root `AGENTS.md`, the relevant game/category `AGENTS.md` including `Current milestones`, and that category's ownership entry once.
- Keep those rules in the conversation context. Do **not** re-open or re-read the same instruction files for every later user command in the same conversation.
- Read `GAME_DELIVERY_PROTOCOL.md` and `GIT_WORKFLOW_RULES.md` only when the conversation first reaches commit/push/promotion/Replit work; after that, keep them in context and do not re-read them for each delivery step.
- Re-read instructions only when there is a concrete reason: the user says rules/milestones changed, the conversation switches to another game/category/repository, the active branch/context changes, or a tool reports stale/conflicting state that requires refreshing the source.
- After session initialization, simple questions, explanations, design discussions, and small follow-up instructions should be answered directly without repo reads unless current repository state is genuinely needed.

## Permanent branch model
- Slot work: `feature/slot`
- Cadı Kazan work: `feature/cadi-kazan`
- Idle / İşletmeler work: `feature/idle`
- Hub/site work: `feature/hub`
- Account/auth work: `feature/account`
- Blackjack work: `feature/blackjack`
- Roulette 2D work: `feature/roulette-2d`
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
Routine Slot updates must have zero file changes in Cadı Kazan, Idle, Hub, Account/Auth, Blackjack and Roulette. The same isolation rule applies symmetrically to every game/category.


## Release workflow
Isolation layout v2 is active. Game agents only develop and commit inside their declared ownership. The central integration/release flow selects a game and source commit and promotes only that game's owned roots to `integration/replit-preview`. Do not manually merge a full feature branch into preview.

## Shared wallet/session invariant
- There is exactly one spendable wallet authority for the whole product: `shared_wallets`.
- There is exactly one live anonymous game-session identity: the `game_session` cookie. Slot, Roulette, Cadı Kazan, Idle/İşletmeler, Blackjack and future games must all read and mutate the same `shared_wallets` row for that same session.
- Game-specific wallet tables or per-game starting balances are forbidden. Per-game ledger/round tables are allowed only as audit/history and must never become an independent balance authority.
- `roulette_wallets` and `roulette_session` are legacy migration inputs only. Runtime gameplay must not read, debit, credit or recreate them as live wallet authority.
- Legacy migration must be one-time and idempotent. If an untouched default `shared_wallets` row conflicts with a real legacy balance, migration may repair the default; an established non-default canonical shared balance must be preserved.
- Money columns that can contain stakes, payouts, wallet balances or ledger deltas must use BIGINT-safe storage. Do not introduce 32-bit integer casts on monetary settlement paths.
- Wallet/session changes are shared/platform work owned by the central integration flow. They require cross-game regression coverage proving every game points to `shared_wallets` and `game_session`.

### Dependency-scoped release gates
- A normal one-game promotion is blocked by: ownership/isolation checks, production artifact builds, shared platform contracts, and the selected game's owned regression surface.
- Unchanged foreign-game regressions are not promotion blockers. After a successful preview push, all games run again as advisory integration regressions so failures stay visible without forcing an unrelated promotion retry.
- Shared/platform or multi-game preview changes use the broader blocking gate: full workspace typecheck plus cross-game shared/platform smoke in addition to the critical artifact/platform gate.
- Shared wallet, session identity, API routing/startup, schema aggregation and deployable artifact builds are always critical contracts. A break in these blocks every promotion because it can corrupt or disable multiple games.
- Keep feature branches isolated. Compatibility with the latest preview is proven by overlaying the immutable feature SHA onto the current preview during promotion; do not routinely merge preview back into feature branches just to reduce drift.


## Agent operating discipline
1. Before coding, verify the active branch matches the task and inspect working-tree status. If unrelated uncommitted changes exist, do not overwrite or absorb them.
2. Before editing, check the intended files against `.github/game-ownership.json`. Normal game work stays inside that game's owned/development roots.
3. Use mini-parts to prevent timeouts, not to create tiny busywork. One mini-part should be one coherent, meaningful checkpoint and may touch several tightly related owned files plus its relevant test. Do not split trivial adjacent edits into separate parts, and do not combine unrelated objectives or long exploratory work into one part.
4. Search narrowly first: inspect the target game's owned area and the smallest relevant code/log slice. Widen only when evidence requires it. Avoid dumping entire files, giant logs, or broad repository scans when targeted inspection is enough.
5. If the correct fix requires a shared/platform or foreign-game file, stop and hand that dependency to the central integration flow. Do not hide the dependency with a workaround, duplicate hack, or cross-game import.
6. Before each game commit, run the relevant targeted test/check and inspect the diff/file list. A normal game commit must contain only that game's allowed paths.
7. Refactors, test work, isolation work, performance work, and backend work must not silently redesign UI, game rules, payouts, physics, or user-visible behavior.
8. GitHub Actions is a verification/release gate, not the default execution environment. Routine code edits, file writes, local/owned simulations, targeted tests, and ordinary feature-branch commits/pushes do **not** require a GitHub Actions run unless a workflow-only environment is genuinely required.
9. Do not dispatch GitHub Actions merely to prove that code was written or to run a test/simulation that can be executed directly in the working environment. Use Actions for preview promotion/release, explicitly requested CI verification, or checks that cannot be performed locally/directly.
10. Do not busy-poll GitHub Actions in fixed short loops (for example every 30 seconds). If a workflow is actually required, make only the minimum status checks needed to determine its result or unblock the next gated step; avoid repeated waiting/checking cycles that keep the user blocked.
11. Treat GitHub CI (GitHub Actions runners) as independent verification, not as the place to do ordinary development work. Prefer direct/local execution for simulations, unit tests, typechecks, builds, and other checks whenever the current working environment can run them reliably. Use CI mainly for final/independent verification, release/promotion gates, or checks that genuinely require the GitHub runner environment.


## Preview / Replit protocol
- A preview request follows this order: finish and commit the game change on its feature branch; promote only that game's owned roots to `integration/replit-preview` through the one-game promotion flow; then refresh Replit's existing integration branch.
- Do not connect to Replit first and do not ask Replit Agent routine status/debugging questions.
- For the normal Replit refresh, give the user a short shell command using `scripts/replit-sync-preview.sh`. When promotion produced a preview SHA, pass that exact SHA so the helper can prove the promoted commit is contained in Replit HEAD.
- State the exact success criteria with the snippet: branch must print `integration/replit-preview`; ahead/behind must print `0 0`; working-tree status must print nothing; and when an expected preview SHA was supplied, `EXPECTED_PRESENT` must print `yes`.
- Never use reset --hard, rebase, force-push, or feature-branch switching in Replit.
- Query Replit only when the user's shell output shows an error, wrong branch, non-clean tree, non-fast-forward/ahead-behind problem, or when the user explicitly asks for Replit-side diagnosis.
- The Replit API development runtime must auto-rebuild/restart when API, game-engine, or shared DB source changes after a preview fast-forward. A successful Git sync alone must never be treated as proof that an already-running API process loaded the new backend code. When introducing/changing the watcher itself, restart the API workflow once so the watcher becomes active.


## General game delivery protocol
This protocol is mandatory for every game/category. Before commit, promotion, or Replit work, read `GAME_DELIVERY_PROTOCOL.md`.

The repository has three separate lanes:
1. **Development lane** — work and commits stay on the category's `feature/*` branch. Default rule: one active writer per feature branch. If the remote feature HEAD changes unexpectedly during a task, stop, fetch, inspect the new commits, and reconcile deliberately; never blind-merge, overwrite, or force-push. Parallel writers for the same game must use separate temporary task branches.
2. **Promotion lane** — routine game releases reach `integration/replit-preview` only through the serialized one-game promotion workflow, using an immutable source commit SHA. Game agents and Replit must never manually merge/push routine game commits into the integration branch.
3. **Replit lane** — Replit is a read-only consumer of `integration/replit-preview`. Replit never creates product commits and never pushes to GitHub. Normal refresh is fetch + fast-forward only through `scripts/replit-sync-preview.sh`.

Race handling is fail-safe: if a feature branch or preview branch moves while an operation is in progress, abort/re-run from the newest verified HEAD instead of automatically merging unrelated work. A successful preview sync must prove both that Replit matches the current remote preview and, when an expected promoted preview SHA is supplied, that this SHA is an ancestor of the running HEAD.


## Milestone continuity
- At the start of a new conversation, read the closest owned `AGENTS.md` and its `Current milestones` once before substantial work; do not re-read them on each later task in the same conversation.
- Record a milestone only when it materially changes what the next agent needs to know: a durable architecture/behavior decision, a completed phase, a validated baseline, a significant blocker/root cause, or the next agreed checkpoint.
- Game agents update milestones only in their own game/category `AGENTS.md`. Shared/platform/integration milestones are maintained only by the central integration flow in this root `AGENTS.md`.
- Keep milestones curated, not chronological noise: newest first, normally 5–10 bullets maximum, replace/remove superseded items, and never paste raw logs, long failed experiments, or full chat history.
- Preferred format: `YYYY-MM-DD — Milestone — current result/state. Next: ...`
- Before ending a substantial task or handing work to a new chat, update the milestone section if the durable state changed. If nothing important changed, do not add a milestone.
- Code, tests, ownership manifest, and validated runtime behavior remain the source of truth if a milestone note becomes stale.

## Shared/platform current milestones
- 2026-09-30 — Replit API reload gap fixed — API `dev` runtime now watches API source, Cascade/game-engine source and shared DB source, rebuilds and restarts after preview fast-forwards; this prevents frontend/new Git state from running against a stale backend process. One API workflow restart is required when first rolling out the watcher. Next: sync the watcher preview SHA to Replit, restart API once, then verify a $50,000 Slot spin against the canonical shared wallet.
- 2026-09-30 — Canonical shared wallet invariant enforced — `shared_wallets` is the sole live balance authority and `game_session` the sole live session identity for every game; `roulette_wallets` / `roulette_session` are migration-only. Legacy balances are imported idempotently, untouched default shared rows can be repaired from real legacy balances, established canonical balances are preserved, and Slot monetary settlement/storage is BIGINT-safe for high bets. Cross-game platform regression locks this contract. Next: validate the shared/multi-game gate, merge the integration fix to preview, then fast-forward Replit.
- 2026-09-29 — Dependency-scoped promotion gates defined — routine one-game promotion now blocks only on deployable artifact/platform contracts plus the selected game's owned tests; post-preview foreign-game regressions are advisory, while shared/multi-game changes still require broad blocking typecheck + cross-game smoke. Next: validate the new workflow on the integration branch before promoting it to preview.
- 2026-09-28 — Blackjack central integration wiring prepared and current-preview preflighted — shared runtime wiring is staged on `integration/blackjack-runtime-wiring-v2` from preview base `697e50b5540a0535c6908606762fcf04244e6eb8`: `/blackjack` browser bootstrap establishes `game_session`, server startup attaches the owned Blackjack scheduled WebSocket runtime, `shared_wallets` is loaded server-side for seat accounts, and Blackjack snapshot persistence CAS-updates the shared wallet in the same DB transaction so concurrent foreign wallet changes fail closed instead of being overwritten. Current-base preflight PR #102 (closed unmerged) with immutable Blackjack feature SHA `8634e6f4cab49e97187424b482a4b808af552c71` passed workspace typecheck, Cascade build, expanded frontend 51/51, expanded backend plus shared isolation 420/420; only the known four Idle integration tests remained red. Next: dispatch `Promote One Game To Replit Preview` with game=`blackjack` and source_ref=`8634e6f4cab49e97187424b482a4b808af552c71`, then replay the staged shared wiring onto the resulting newest preview HEAD and refresh Replit.
- 2026-09-28 — Roulette 2D category re-established from a clean baseline — `feature/roulette-2d` owns only `artifacts/cascade-8/src/roulette`; the old 3D implementation is not reused. `/roulette` is wired centrally for isolated preview work. Next: build the reference-matched procedural wheel in owned files.
- 2026-09-27 — Race-safe delivery protocol active — canonical feature branches use single-writer discipline, promotions use immutable commit SHAs and abort if preview HEAD moves, and Replit is read-only with verified fast-forward sync. Next: use `GAME_DELIVERY_PROTOCOL.md` for every commit → promotion → Replit handoff.
- 2026-09-27 — Blackjack category established — `feature/blackjack` owns isolated frontend, API and Blackjack schema roots; shared route/schema wiring remains a central integration responsibility. Next: build the isolated Blackjack skeleton and validate ownership CI.
- 2026-09-27 — Account/Auth category established — auth development is isolated on `feature/account` with owned frontend, API and DB-schema roots; shared route/schema wiring remains a central integration responsibility. Next: build and validate email/password auth foundation on the account branch.
- 2026-09-26 — Isolation v2 active — game work is branch- and ownership-scoped; preview promotion copies only the selected game's owned roots into `integration/replit-preview`.
- 2026-09-26 — Replit workflow normalized — Replit stays on `integration/replit-preview`; legacy `main` preview instructions are obsolete; normal refresh is fast-forward only.
