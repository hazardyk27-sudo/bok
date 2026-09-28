# OYUN — Game Delivery Protocol

This is the general delivery protocol for every game/category in OYUN. It covers development commits, GitHub promotion, and Replit refresh. Game-specific `AGENTS.md` files add local ownership/context; this file defines the shared delivery mechanics.

## 1. Three-lane model

### Development lane
Normal work happens on the category's feature branch, for example `feature/slot` or `feature/cadi-kazan`.

- Work only inside that category's allowed ownership/development roots.
- Commit and push only to that feature branch.
- A feature commit is not a preview release.
- Replit is not a development workspace.

### Promotion lane
Routine game changes reach `integration/replit-preview` only through the serialized one-game promotion workflow.

- Promotion source must be an immutable commit SHA, never a moving branch name.
- The workflow copies only the selected category's promotion roots.
- It runs validation before push.
- Routine game agents must not manually merge/push into `integration/replit-preview`.
- Do not run `scripts/promote-game.mjs` from Replit. Promotion runs in GitHub Actions, where the GitHub remote is `origin`; Replit's normal sync remote is `github`. Do not mix these two environments/remotes.
- If the preview branch moves during promotion, the promotion must abort and be re-run from the newest preview HEAD. Do not auto-merge unrelated preview commits.

### Replit lane
Replit is a read-only consumer of `integration/replit-preview`.

- Replit never creates product commits.
- Replit never pushes to GitHub.
- Replit never switches to feature branches.
- Normal refresh is `bash scripts/replit-sync-preview.sh`, which performs fetch + fast-forward only.

## 2. Single-writer rule for feature branches

Default: one active writer per feature branch.

Before the first write/commit of a task:
1. confirm the active feature branch;
2. fetch the remote feature branch;
3. record the remote feature HEAD;
4. inspect working-tree status and existing local changes.

Immediately before push:
1. fetch the remote feature branch again;
2. compare current remote HEAD to the recorded HEAD;
3. if it moved unexpectedly, stop and inspect the new commits before doing anything else.

Do **not** blindly run merge/rebase/force-push after a push rejection.

If parallel work on the same game is genuinely required, each writer uses a separate temporary task branch. Only one controlled integration step may advance the canonical `feature/<game>` branch.

## 3. Stale-SHA / concurrent-write handling

When an agent edits through GitHub/API tools:
- re-read the target file/branch HEAD immediately before writing;
- use the current blob SHA/ref state;
- if GitHub returns 409/conflict/stale SHA, re-read and reconcile;
- never retry by force or by reconstructing an older tree that could drop someone else's commits.

When an agent edits locally:
- a rejected push means the remote branch moved;
- fetch and inspect first;
- do not use force push;
- do not automatically merge unknown commits just to make the push succeed.

## 4. Commit checklist

Before a normal feature commit:
- branch is the correct `feature/<category>`;
- intended files are inside allowed ownership/development roots;
- unrelated local changes are not absorbed;
- relevant targeted test/check passes;
- diff/file list contains no foreign/shared paths;
- remote feature HEAD has not changed unexpectedly since the task's baseline.

## 5. Promotion checklist

Promotion must use the exact approved feature commit SHA.

The promotion workflow must:
- verify the SHA belongs to the declared feature branch;
- serialize with other preview promotions;
- record the preview HEAD used as its base;
- copy only the target category's promotion roots;
- reject shared/foreign changes;
- run typecheck/build/regressions;
- re-check remote `integration/replit-preview` immediately before push;
- abort with a clear "preview moved" result if remote preview changed;
- never auto-merge unrelated preview changes;
- print the final promoted preview SHA on success.

If the workflow aborts because preview moved, simply re-run the same immutable source SHA against the newest preview HEAD.

## 6. Replit refresh checklist

After promotion succeeds, Replit refresh uses the shared shell helper, not Replit Agent.

Preferred command:

```bash
bash scripts/replit-sync-preview.sh github <EXPECTED_PREVIEW_SHA>
```

`EXPECTED_PREVIEW_SHA` is the preview commit produced by the promotion workflow.

Success requires:
- branch = `integration/replit-preview`;
- ahead/behind = `0 0` against the latest fetched remote preview;
- working tree clean;
- if expected SHA was supplied, that SHA is an ancestor of Replit HEAD.

If GitHub preview moves during refresh, the helper re-fetches and safely fast-forwards again up to a small bounded number of attempts. If it cannot stabilize, it aborts and the user re-runs it later.

## 7. When Replit Agent may be used

Do not ask Replit Agent routine questions such as "what branch are you on?" or "pull latest".

Use deterministic shell output first.

Query Replit Agent only when shell output shows:
- wrong branch;
- dirty working tree;
- unexpected local commits;
- fast-forward failure;
- runtime/build/service failure after a verified sync;
- or the user explicitly asks for Replit-side diagnosis.

## 8. Forbidden shortcuts

Never solve delivery problems with:
- `git reset --hard`;
- force push;
- rebase in Replit;
- feature-branch switching in Replit;
- committing directly in Replit;
- blind `fetch + merge + push` into the shared preview branch;
- promoting a moving branch name instead of an exact source SHA;
- automatically merging unknown remote changes after a push rejection.

## 9. Required handoff facts

When a game change is ready for preview, the game agent should provide only the facts the central delivery flow needs:
- game/category;
- exact feature commit SHA;
- relevant validation result;
- whether any shared/platform dependency remains.

The central flow handles promotion and Replit refresh.
