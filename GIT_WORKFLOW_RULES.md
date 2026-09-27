# OYUN — Git Workflow Rules (Isolation v2)

This file is mandatory project process for parallel ChatGPT/GitHub/Replit work.
It is aligned with root `AGENTS.md` and `.github/game-ownership.json`.

## 1. Permanent branch ownership

Each product area has one development branch:

- Slot: `feature/slot`
- Roulette: `feature/roulette`
- Cadı Kazan: `feature/cadi-kazan`
- Idle / İşletmeler: `feature/idle`
- Hub / site: `feature/hub`
- Account/Auth: `feature/account`
- Blackjack: `feature/blackjack`

The shared preview branch is:

`integration/replit-preview`

GitHub `main` is not the Replit preview branch and must not be used as a substitute for the integration branch.

A game chat works only on its own feature branch and only inside the owned/development roots declared for that game in `.github/game-ownership.json`.

## 2. Replit workspace rule

The normal Replit project directory is an integration/preview workspace only.

It must remain on:

`integration/replit-preview`

Do not develop normal game changes directly in Replit and do not switch the shared Replit workspace to a feature branch.

Forbidden in the shared Replit workspace:

- `git switch feature/...`
- `git checkout feature/...`
- `git reset --hard ...`
- rebase
- force push
- force checkout
- destructive clean/stash workflows used to hide divergence
- conflict-resolution merges used to force a preview
- local feature commits made directly in Replit

## 3. Commit is not release

A commit on a feature branch only saves that game's work.

It does **not** update Replit and does **not** update `integration/replit-preview`.

The release path is:

```text
feature/<game>
    ↓  one-game promotion: owned roots only
integration/replit-preview
    ↓  fast-forward sync only
shared Replit preview
```

Never merge an entire feature branch into the preview branch for a routine game release.

## 4. One-game promotion

Use the `Promote One Game To Replit Preview` workflow.

Promotion must:

- accept only a source commit that belongs to the declared game branch
- require the current isolation layout version
- copy only the selected game's promotion roots
- preserve every non-target game's tree
- reject foreign/shared changes
- pass typecheck, build, frontend integration regression and backend isolation regression before preview push

Development-only roots/prefixes may be used by a game's feature branch when declared in the ownership manifest, but they are not automatically promoted unless they are also promotion roots.

## 5. Shared/platform changes

Shared/platform files are not normal game work. Examples include:

- root router/app shell
- wallet/session platform code
- workspace/package/lock files
- shared build/config
- shared DB schema aggregator or wallet schema
- ownership/promotion infrastructure

If the correct fix requires a shared/platform or foreign-game file, stop normal game work and hand that dependency to the central integration flow.

Do not hide a shared dependency with duplicate code, a workaround, or a cross-game import.

## 6. Safe Replit refresh

After the approved promotion has updated GitHub `integration/replit-preview`, refresh Replit with:

```bash
bash scripts/replit-sync-preview.sh github <EXPECTED_PREVIEW_SHA>
```

The helper must abort instead of overwriting work when:

- the Replit workspace is not on `integration/replit-preview`
- the working tree is dirty
- local preview contains commits not present on GitHub preview
- a fast-forward is not safe

Success criteria are exact:

- branch prints `integration/replit-preview`
- ahead/behind prints `0 0`
- porcelain working-tree status prints nothing

If the helper aborts, investigate first. Never replace the failure with hard reset, rebase, force checkout, or force push.

The old `scripts/replit-sync-main.sh` name is compatibility-only and delegates to the preview sync helper; it must never sync `main`.

## 7. Replit Agent usage

Do not connect to Replit Agent for routine status questions or normal sync.

Prefer the deterministic shell sync/check above.

Query Replit only when:

- the shell reports an error
- the branch is wrong
- the working tree is not clean
- ahead/behind is unexpected
- fast-forward fails
- runtime diagnosis is explicitly needed
- the user explicitly asks for Replit-side inspection

## 8. Parallel work

If multiple feature branches need local Shell work at the same time, use separate physical worktrees or separate isolated environments.

Conceptually:

```text
shared-replit/        -> integration/replit-preview
worktree-slot/        -> feature/slot
worktree-roulette/    -> feature/roulette
worktree-cadi/        -> feature/cadi-kazan
worktree-idle/        -> feature/idle
worktree-hub/         -> feature/hub
worktree-account/     -> feature/account
worktree-blackjack/   -> feature/blackjack
```

Never change the shared Replit branch to make one feature appear in Preview.

## 9. Multi-chat invariant

Every game conversation owns only its declared game branch and ownership roots.

Routine work in one game must produce zero code/artifact changes in every other game.

If any older note or document says Replit should stay on `main`, that instruction is obsolete. Isolation v2 uses `integration/replit-preview`.


## 10. Race and moving-HEAD rule

The preview branch and feature branches may be active while multiple chats are open. Treat every branch HEAD as moving state.

- Default: one active writer per canonical `feature/<game>` branch.
- Before a feature push, fetch the remote feature branch again. If its HEAD changed unexpectedly since the task baseline, stop and inspect; do not blind-merge or force-push.
- If same-game parallel work is required, use separate temporary task branches and integrate deliberately into the canonical feature branch.
- Routine game releases must never manually push/merge into `integration/replit-preview`; only the serialized promotion workflow may write game changes there.
- Promotion input is an immutable feature commit SHA, not a branch name.
- Promotion records its preview base and re-checks remote preview immediately before push. If preview moved, abort/re-run; never auto-merge unrelated preview commits.
- Replit never pushes to GitHub. It only fast-forwards from `integration/replit-preview`.
- A rejected push or stale SHA is a synchronization signal, not permission to merge blindly.

See `GAME_DELIVERY_PROTOCOL.md` for the complete commit → promotion → Replit procedure.
