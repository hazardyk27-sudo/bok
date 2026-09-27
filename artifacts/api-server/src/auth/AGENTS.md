# Account / Auth ownership

This directory is the backend-owned root for the shared account system.

- Work only on `feature/account` for normal account/auth development.
- Do not modify game-owned files.
- Shared router/schema/bootstrap wiring is performed separately by the central integration flow.
- Passwords must never be stored or logged in plaintext.
- Session cookies are opaque, HttpOnly credentials; only a one-way token hash is stored server-side.
- Authentication changes must not silently alter game economy, wallet balances, or game rules.

## Resend runtime configuration
- `RESEND_API_KEY`: Resend server API key; secret only, never expose to the browser.
- `RESEND_FROM_EMAIL`: verified sender, for example `Fahrinin Yolu <account@example.com>`.
- `AUTH_PUBLIC_BASE_URL`: public HTTPS origin used to build verification links, with no trailing slash.

## Current milestones
- 2026-09-27 — Resend email verification implemented — registration now automatically issues a 24-hour single-use verification token and attempts transactional delivery through Resend; only token hashes are stored, Resend requests use idempotency keys, resend is rate-limited, verification updates `emailVerified`, and the account UI exposes verification state/retry. Ownership, repository typecheck and production build pass. Preview promotion remains blocked only by the unrelated pre-existing Idle UI regression. Next: configure production Resend secrets/domain, central route/schema wiring after the blocker, then password reset and account-to-wallet identity migration.
