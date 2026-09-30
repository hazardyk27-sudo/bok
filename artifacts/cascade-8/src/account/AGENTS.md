# Account / Auth agent instructions

> **Mandatory startup:** First read the canonical project handbook at `integration/replit-preview:AGENTS.md`. Then read this file. These are the only two mandatory instruction files for a normal Account/Auth conversation. The canonical root handbook owns all shared GitHub/Replit/Supabase/wallet/promotion/Shell rules.

## Purpose
Account/Auth is the shared player identity experience for all games. It provides email + username + password registration, login, profile/session state, password change and logout. It must not create a separate per-game identity or wallet model.

## Branch and ownership
- Canonical branch: `feature/account`
- Frontend root: `artifacts/cascade-8/src/account`
- Backend root: `artifacts/api-server/src/auth`
- DB schema: `lib/db/src/schema/auth.ts`
- Development-only e2e root: `artifacts/cascade-8/e2e/account.spec.ts`

Shared route/bootstrap integration remains central-platform work.

## Security / architecture invariants
- Authentication state is server-authoritative.
- Current frontend reads session state from `/api/auth/me`.
- Register/login/resend/logout use `/api/auth/*`.
- Requests use same-origin credentials.
- Never store auth tokens or passwords in `localStorage` or `sessionStorage`.
- Passwords must never be logged or committed.
- Session cookies must stay server-managed/HttpOnly where applicable.
- Account identity must integrate with the shared product identity model rather than creating game-specific accounts.
- Secrets/API keys belong in secret storage, never source control.

## Email verification
Email verification is intentionally disabled for the current milestone. Registration must succeed without outbound email delivery. Keep provider secrets out of source control; verification may be reintroduced later as a separate product milestone.

## Validation
Before commit, run the Account/Auth owned tests/e2e relevant to the change and verify all changed paths stay inside Account-owned/development roots. Shared routing, shared session/wallet linkage, or platform schema aggregation must be handed to central integration.

## Current milestones
- 2026-09-30 — Email/username account + profile foundation — registration now uses unique email + unique normalized username + password, login accepts email or username, each user receives a DB-sequenced immutable usercode formatted like `0000-0000-01`, the account is linked to the shared `game_session` wallet, profile exposes shared balance/email/username/usercode, and authenticated password change revokes other auth sessions. Email verification is disabled for this milestone.
- 2026-09-30 — Account instruction scope standardized — canonical project delivery/Replit/Supabase rules moved to the master handbook; this file now owns Account/Auth-specific security, API, ownership and milestone context.
- 2026-09-27 — Account page baseline — login/register/profile/logout UI exists as a self-contained module using server-side cookie auth, with email-verification state and resend UI. Next platform work: complete central route/API/schema wiring and enable production email delivery when the deployment domain is ready.
