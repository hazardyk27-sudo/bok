# Account / Auth agent instructions

> **Mandatory startup:** First read the canonical project handbook at `integration/replit-preview:AGENTS.md`. Then read this file. These are the only two mandatory instruction files for a normal Account/Auth conversation. The canonical root handbook owns all shared GitHub/Replit/Supabase/wallet/promotion/Shell rules.

## Purpose
Account/Auth is the shared player identity experience for all games. It provides registration, login, profile/session state, email verification status, resend-verification and logout. It must not create a separate per-game identity model.

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
The frontend supports verification state and resend-verification. Resend is the intended outbound email provider, but production email delivery remains a deployment/domain concern. Do not hardcode provider secrets or fake successful delivery.

## Validation
Before commit, run the Account/Auth owned tests/e2e relevant to the change and verify all changed paths stay inside Account-owned/development roots. Shared routing, shared session/wallet linkage, or platform schema aggregation must be handed to central integration.

## Current milestones
- 2026-09-30 — Account instruction scope standardized — canonical project delivery/Replit/Supabase rules moved to the master handbook; this file now owns Account/Auth-specific security, API, ownership and milestone context.
- 2026-09-27 — Account page baseline — login/register/profile/logout UI exists as a self-contained module using server-side cookie auth, with email-verification state and resend UI. Next platform work: complete central route/API/schema wiring and enable production email delivery when the deployment domain is ready.
