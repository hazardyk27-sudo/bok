# OYUN — MASTER AGENT HANDBOOK

This is the single authoritative project-wide instruction file for OYUN.

**Canonical copy:** `integration/replit-preview:AGENTS.md`

A feature branch may contain an older root copy because shared files are deliberately not merged back into every feature branch. Therefore, at the start of every new OYUN conversation, read this file from `integration/replit-preview`, then read exactly one relevant game/category `AGENTS.md` from that category's feature branch.

Do not treat `GAME_DELIVERY_PROTOCOL.md`, `GIT_WORKFLOW_RULES.md`, `OYUN_PROJECT_MEMORY.md`, or `.agents/memory/**` as mandatory instruction sources. Project-wide operating rules live here. Historical/memory files are reference material only.

## 1. Startup contract

For a normal game conversation, the startup sequence is:

1. Read `integration/replit-preview:AGENTS.md` once.
2. Read the relevant game/category `AGENTS.md` once, including its `Current milestones`.
3. Keep both in conversation context. Do not re-read them on every command.
4. Before the first code write, verify the target branch and check the relevant ownership entry in `.github/game-ownership.json`.
5. Re-read only if the user says rules/milestones changed, the category/repository changes, or a real branch/state conflict requires refresh.

Do **not** read other games' `AGENTS.md` files unless the task is explicitly a cross-game/platform audit.

## 2. What OYUN is

OYUN is one multi-game web product with a shared site shell, shared anonymous session identity, shared virtual-credit wallet, one web artifact, and one API artifact.

Current product areas:
- Hub / main game selector: `/`
- Slot / Cascade 8: `/slot`
- Cadı Kazan / scratch cards: `/cadi-kazan`
- Idle / İşletmeler: `/businesses`
- Blackjack: `/blackjack`
- Roulette 2D: `/roulette`
- Account/Auth: shared account subsystem, not an independent game route

The product is virtual-credit only. Do not add real-money deposits, withdrawals, cash-out processors, or payment rails unless the user explicitly changes the product scope.

## 3. Repository and branch model

Permanent development branches:
- Slot: `feature/slot`
- Cadı Kazan: `feature/cadi-kazan`
- Idle / İşletmeler: `feature/idle`
- Hub/site: `feature/hub`
- Account/Auth: `feature/account`
- Blackjack: `feature/blackjack`
- Roulette 2D: `feature/roulette-2d`

Shared preview branch:
- `integration/replit-preview`

Replit must stay on `integration/replit-preview`.

Normal game work happens only on that game's feature branch and inside that game's roots declared in `.github/game-ownership.json`. A game agent never edits another game's roots. Shared platform files are handled by the central integration flow.

Examples of shared/platform ownership:
- root router / app shell
- shared styles/build/workspace configuration
- API router/startup
- wallet/session platform code
- shared wallet schema
- schema aggregator
- promotion/CI/Replit infrastructure

If a game fix requires a shared or foreign file, do not hide the dependency with duplicate code. Hand it to central integration.

## 4. ChatGPT / GitHub / Replit / Supabase responsibility split

### ChatGPT
ChatGPT is the control plane for planning, code review, code changes, testing, promotion, integration and diagnosis.

### GitHub
GitHub is the source of truth for code and branch state.
- Game code is written/committed to its feature branch.
- Routine preview release is performed by the serialized `Promote One Game To Replit Preview` workflow.
- Promotion input is an immutable feature commit SHA, never a moving branch name.
- Replit never becomes the source of truth.

### Replit
Replit is the runtime/preview consumer only.
- Do not do normal development in the shared Replit workspace.
- Do not switch Replit to feature branches.
- Do not commit or push from Replit.
- Do not use Replit Agent for routine sync/status work.
- Normal code delivery to Replit is **only** the standard Shell fast-forward command in section 10.

### Supabase
Supabase is the target database platform, but database cutover is a separate controlled platform operation.
- Never commit connection strings or secrets.
- Use Replit/Supabase secret storage for credentials.
- Database migrations/cutover are central integration work, not a game-agent task.
- Do not infer that Supabase is live merely because `SUPABASE_DATABASE_URL` exists.

## 5. Runtime architecture

Frontend artifact:
- workspace: `artifacts/cascade-8`
- Replit web service path: `/`
- tracked local web port: `20003`

API artifact:
- workspace: `artifacts/api-server`
- Replit API service path: `/api`
- tracked local/runtime port: `8080`

The web dev server proxies `/api` to `127.0.0.1:8080`. The web artifact pins `API_PROXY_TARGET=http://127.0.0.1:8080`; the API artifact, Vite fallback and `scripts/run-local-stack.sh` must remain aligned on this same port. The standard Replit sync helper runs post-merge setup when HEAD advances, touches watched API/Vite files to force runtime reload, and verifies `/api/healthz` on port 8080 before reporting success.

Main frontend route dispatch lives in `artifacts/cascade-8/src/main.ts`.
Main API mounting lives in `artifacts/api-server/src/app.ts` and `artifacts/api-server/src/routes`.

A successful Git sync does not by itself prove an already-running API process loaded new backend code. Replit API development runtime must rebuild/restart when relevant API/game/shared DB source changes. If the watcher itself changes, restart that workflow once.

## 6. Shared wallet and session invariants

There is exactly one live spendable wallet authority:
- `shared_wallets`

There is exactly one live anonymous game identity:
- `game_session`

Rules:
- Every game reads/debits/credits the same `shared_wallets` row for the same `game_session`.
- Canonical `game_session` must be root-scoped with `Path=/`.
- Game-specific live wallets are forbidden.
- Per-game ledger/round tables may exist only for audit/history/idempotency.
- `roulette_wallets` and `roulette_session` are legacy migration inputs only.
- Legacy fragmented/scoped sessions converge to one canonical identity without summing duplicate balances; preserve the highest established server-side balance during convergence.
- Money paths must remain BIGINT-safe.
- Wallet/session changes are always shared/platform work and require cross-game regression coverage.

## 7. Database state and Supabase cutover rules

Runtime DB selection is explicit:
- default/runtime authority: `DATABASE_URL`
- Supabase target: `SUPABASE_DATABASE_URL`
- runtime switches to Supabase only when `USE_SUPABASE_DATABASE=true`
- when the flag is false, `DATABASE_URL` is mandatory; `SUPABASE_DATABASE_URL` must never be used as an implicit fallback
- when the flag is true, the API must find a valid `VERIFIED` `helium_to_supabase_v1` row in `oyun_migration_receipts` before opening its HTTP listener

Both runtime Drizzle and schema tooling must follow the same selection rule.

Current policy: **do not cut over to Supabase until the general game/platform audit is complete and migration verification is hardened.**

Required migration sequence:
1. Freeze/identify the exact source database and target Supabase database.
2. Confirm target schema contains all required source tables.
3. Refuse automatic merge into a non-empty target unless a deliberate reconciliation plan exists.
4. Take a source snapshot/dump without mutating source.
5. Restore to Supabase.
6. Verify every migrated table with row counts **and deterministic content checksums**, not row count alone.
7. Verify critical wallet/ledger/round/state relationships and sequence/id integrity.
8. Only after all verification passes, enable `USE_SUPABASE_DATABASE=true`.
9. Restart/reload the API.
10. Prove runtime is actually using Supabase and run cross-game wallet/core smoke tests.
11. Keep rollback information until post-cutover validation is complete.

The existing migration script must not be treated as final cutover authorization if it only verifies row counts.

## 8. Development discipline

Before coding:
- verify the active feature branch;
- fetch/inspect the current remote feature HEAD;
- inspect working-tree status when local;
- verify intended paths against `.github/game-ownership.json`.

During work:
- search narrowly first;
- preserve game rules/UI/behavior during infrastructure/refactor work unless the user asked to change them;
- use meaningful mini-parts, not artificial micro-steps;
- do not absorb unrelated changes;
- do not modify shared/platform files from a normal game task.

Before feature commit:
- run the relevant owned regression/test/check;
- inspect changed paths;
- confirm no foreign/shared path leaked into the commit;
- fetch remote feature HEAD again;
- if it moved unexpectedly, stop and inspect instead of blind merge/rebase/force push.

Default: one active writer per canonical feature branch. Same-game parallel work requires separate task branches and deliberate integration.

## 9. Promotion standard

A feature commit is **not** a Replit release.

Normal path:

```text
feature/<game>
  -> exact immutable commit SHA
  -> Promote One Game To Replit Preview
  -> integration/replit-preview
  -> standard Replit Shell sync
```

Promotion must:
- accept the exact feature commit SHA;
- verify the SHA belongs to the expected game branch;
- copy only that game's promotion roots;
- preserve all non-target games;
- run deployable web/API + shared critical platform checks;
- run the selected game's owned regression gate;
- not block on unchanged foreign-game stale regressions;
- re-check preview HEAD immediately before push;
- abort/re-run if preview moved rather than auto-merging unrelated work.

Shared/platform or multi-game changes use the broad blocking gate: full workspace typecheck + cross-game smoke in addition to critical platform checks.

## 10. Replit Shell transfer standard — mandatory

This is the only normal command format an agent should give the user after a successful promotion.

Replace `<PREVIEW_SHA>` with the exact preview commit produced by the promotion:

```bash
cd ~/workspace || exit 1
set -euo pipefail

EXPECTED="<PREVIEW_SHA>"

bash scripts/replit-sync-preview.sh github "$EXPECTED"
```

Do not add `git pull`, `git merge`, `git rebase`, `git checkout`, `git switch`, `git reset --hard`, `git clean`, force push, cherry-pick, or manual ref manipulation to the normal Replit delivery command.

Success is valid only when the helper prints:
- `BRANCH: integration/replit-preview`
- `AHEAD_BEHIND: 0 0`
- `EXPECTED_PRESENT: yes`
- empty content between `STATUS_BEGIN` and `STATUS_END`

The helper may safely advance beyond the supplied expected SHA if GitHub preview received later valid promotions; the expected SHA must still be an ancestor of final HEAD.

### Replit read-only guard
The shared Replit clone has a Git-level read-only guard:
- `core.hooksPath=.githooks`
- `oyun.replitReadonly=true`
- local commits, merge commits and rebases are blocked;
- push URLs are blocked while fetch URLs remain usable;
- direct updates of `refs/heads/integration/replit-preview` are blocked;
- only `scripts/replit-sync-preview.sh` gets a one-command exception for its verified fast-forward.

If the helper aborts, do **not** bypass the guard. Diagnose with read-only commands first:
- `git branch --show-current`
- `git status --short`
- `git rev-list --left-right --count github/integration/replit-preview...HEAD`
- `git log --oneline github/integration/replit-preview..HEAD`

If local-only commits somehow exist, central integration handles recovery and preserves them behind a backup pointer before realignment.

## 11. Testing and CI philosophy

GitHub Actions is a verification/release gate, not the default place to do ordinary development work.
- Prefer direct/local targeted tests for game work.
- Use Actions for promotion, final independent verification, broad platform/shared changes, or checks that genuinely require CI.
- Do not dispatch Actions just to prove a file was written.
- Do not busy-poll workflows in tight loops.

Normal one-game promotion blocking surface:
- ownership/isolation
- deployable web/API artifacts
- shared critical platform contracts
- selected game's owned tests

Foreign unchanged game regressions remain advisory.

## 12. Milestones and handoff

Each game/category keeps durable state in its own `AGENTS.md` under `Current milestones`.
- newest first;
- keep only durable decisions/baselines/blockers/next checkpoints;
- do not paste raw logs or every commit;
- code/tests/current ownership win if an old milestone conflicts.

Shared/platform milestones live only in this master file and are updated only by central integration.

## 13. Current shared/platform state

- 2026-10-01 — Replit routine sync DB safety — `scripts/post-merge.sh` no longer runs Drizzle schema push during ordinary preview refreshes. Routine sync now installs dependencies and skips DB mutation; schema push requires explicit `OYUN_RUN_DB_PUSH=1` during a separate controlled database maintenance step, preventing non-TTY prompts or destructive-table suggestions from blocking code delivery.


- 2026-09-30 — Supabase fail-closed cutover guard prepared — BOKGAME has 24 application tables plus the platform-only `oyun_migration_receipts` guard table. A successful frozen Helium copy writes a `VERIFIED` receipt only after count/checksum/sequence/relation verification; Supabase-mode API startup refuses to listen without that receipt, and the DB module no longer permits an implicit `SUPABASE_DATABASE_URL` fallback while the cutover flag is false. Next: sync to Replit, run preflight → freeze → copy, confirm `MIGRATION_OK` + receipt, then enable `USE_SUPABASE_DATABASE=true` and run cross-game smoke.
- 2026-09-30 — Supabase schema parity + verified migration pipeline ready — BOKGAME target has the complete 24-table application schema with Slot money columns widened to BIGINT; migration tooling requires the same 24-table contract on Helium, supports database-level source write freeze/status/unfreeze, refuses copy unless source is truly read-only, restores atomically, and verifies source stability, per-table counts/content checksums, sequences and critical wallet/user/ledger relationships before cutover.

- 2026-09-30 — Account/Profile v1 — Account/Auth is wired into the shared product: `/account` and `/api/auth/*` are live integration surfaces, registration uses email + unique username + password without email verification, DB-sequenced usercodes render as `0000-0000-01`, authenticated identity is bound to the canonical `game_session` / `shared_wallets` wallet, login accepts email or username, profile shows shared balance/email/username/usercode, password change revokes other auth sessions, logout detaches the browser to a fresh guest wallet, and Hub renders a fifth Profile card from server-authoritative `/api/auth/me` state.

- 2026-09-30 — API startup hardening v2 — live Replit proved the correct preview HEAD was loaded but port 8080 still never opened because `initializeSharedWalletPlatform()` was still awaited before `server.listen()`. Shared-wallet maintenance now runs after the listener starts, its advisory lock uses non-blocking `pg_try_advisory_xact_lock`, and Replit/local readiness checks use DB-backed `/api/readyz` with bounded probe timeouts instead of treating liveness alone as success.

- 2026-09-30 — Shared API startup isolation — live Replit diagnosis found the API worker process alive but no HTTP listener on canonical port 8080, causing `/api/healthz` 502 / `ECONNREFUSED` and simultaneously breaking Idle HTTP/SSE, Blackjack HTTP/WebSocket, and Roulette HTTP. The shared HTTP server now begins listening before Blackjack durable runtime recovery/attachment, so a stalled Blackjack recovery cannot take the whole API offline; API shutdown also closes the Postgres pool. Regression coverage locks both the canonical 8080 routing contract and listener-before-Blackjack startup ordering.

- 2026-09-30 — Replit runtime alignment is hardened around the artifact-native API port `8080`: web stays on `20003`, API artifact/Vite proxy/local-stack all use `8080`, and the standard sync helper now runs post-merge setup on advancement, forces API/Vite watcher reloads, and requires `/api/healthz` to recover before declaring sync success. This closes the stale-process failure where Git was current but `/api/*` still served old routes.

- 2026-09-30 — Replit read-only preview guard is merged and verified live: branch `integration/replit-preview`, `core.hooksPath=.githooks`, `oyun.replitReadonly=true`, fetch enabled and pushes blocked. This closes the recurring Replit-local commit divergence problem.
- 2026-09-30 — Cross-path session convergence is active: historical scoped game-session cookies are probed and converged into root `game_session`; fragmented wallet identities preserve the highest existing balance without summing credits.
- 2026-09-30 — Supabase is still a staged target, not an authorized runtime cutover. Runtime remains on the explicitly selected database until migration audit + checksum verification + cutover validation are complete.
- 2026-09-30 — Dependency-scoped promotion is active: selected-game + critical platform failures block a normal promotion; unchanged foreign-game regressions are advisory; shared/multi-game changes run the broad blocking gate.

## 14. Repository/project hard boundary

- The agent is authorized to access, inspect, edit, test, or write code **only** in the GitHub repository `hazardyk27-sudo/bok` and the runtime/services that belong to this BOK project.
- **Never access, inspect, modify, code, test, or otherwise touch any other GitHub repository or unrelated project**, even if another repository/project is visible or technically available through connected tools.
- Do not create code, commits, branches, pull requests, issues, files, migrations, deployments, or configuration changes in any project other than `hazardyk27-sudo/bok`.
- When using Replit, Supabase, GitHub, or any other connected service, first ensure the target belongs to the BOK project; if it does not, do not access or modify it.
- This is a hard scope boundary for all agents working on OYUN/BOK.

## 15. Authority order


When instructions conflict, use this order:
1. the user's latest explicit instruction;
2. this canonical `integration/replit-preview:AGENTS.md`;
3. the relevant game's `AGENTS.md`;
4. `.github/game-ownership.json` for exact writable paths;
5. current code/tests/runtime evidence;
6. historical notes/memory.

Never invent missing state. Inspect the repository/runtime when a factual decision depends on it.
