# OYUN — Git Workflow Rules

This file is mandatory project process for parallel ChatGPT/Replit work.

## 1. Branch ownership

Each game has one isolated GitHub feature branch:

- Cadı Kazan: `feature/cadi-kazan`
- Roulette: `feature/roulette`
- Slot: `feature/slot`

A chat working on one game must not write code to another game's feature branch.

## 2. Shared Replit root workspace

The normal Replit project directory is an **integration and Preview workspace only**.

It must remain on:

`main`

Do not use the shared root for normal feature-branch development.

Forbidden in the shared root during normal work:

- `git switch feature/...`
- `git checkout feature/...`
- `git reset --hard ...`
- rebase
- conflict-resolution merge
- force checkout
- force push
- destructive clean/stash workflows used to hide divergence
- creating local feature commits that have not first been integrated through GitHub

## 3. Parallel Shell work requires worktrees

If Cadı Kazan and Roulette are being developed at the same time and both need Shell access, they must use separate physical Git worktrees.

Conceptual layout:

```text
shared-root/          -> main
worktree-cadi/        -> feature/cadi-kazan
worktree-roulette/    -> feature/roulette
worktree-slot/        -> feature/slot
```

Commands executed in one worktree must stay inside that worktree.

Never change the branch of the shared root in order to test a feature.

## 4. Integration flow

The required flow is:

```text
feature/cadi-kazan  ─┐
feature/roulette    ─┼─> GitHub main ─> shared Replit main ─> Preview
feature/slot        ─┘
```

A feature is first committed to its own GitHub branch. After it is approved, integrate it into GitHub `main`. Only then update the shared Replit root.

## 5. Safe Replit sync

After GitHub `main` is ready, the preferred Replit root command is:

```bash
bash scripts/replit-sync-main.sh
```

That helper must abort rather than overwrite work when:

- the root is not on `main`
- the working tree is dirty
- local `main` contains commits not present on GitHub `main`
- fast-forward is not safe

If it aborts, investigate first. Do not replace the failure with a hard reset.

## 6. Shared-file rule

These areas can affect more than one game and require deliberate integration:

- `OYUN_PROJECT_MEMORY.md`
- shared wallet/session code
- root routing / app shell
- package or lock files
- global CSS/config
- database schema used by multiple games

Feature branches should minimize unrelated edits to shared files.

If two feature branches modify the same shared file, resolve the integration on GitHub before Replit is synced.

## 7. Multi-chat rule

When multiple ChatGPT conversations are active:

- Cadı Kazan conversation owns `feature/cadi-kazan`
- Roulette conversation owns `feature/roulette`
- Slot conversation owns `feature/slot`
- no conversation may change the shared Replit root branch away from `main`
- no conversation may use destructive Git commands in the shared root to make its own Preview appear

This rule exists specifically to prevent one game's Shell workflow from rolling back or overwriting another game's work.
