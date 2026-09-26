# OYUN repository operating rules

This repository contains multiple games that must be developed and released independently.

## Permanent branch model
- Slot work: `feature/slot`
- Roulette work: `feature/roulette`
- Cadı Kazan work: `feature/cadi-kazan`
- Idle / İşletmeler work: `feature/idle`
- Hub/site work: `feature/hub`
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
Routine Slot updates must have zero file changes in Roulette, Cadı Kazan, Idle and Hub. The same rule applies symmetrically to every game.


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
