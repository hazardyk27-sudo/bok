# Account / Auth ownership

This directory is the backend-owned root for the shared account system.

- Work only on `feature/account` for normal account/auth development.
- Do not modify game-owned files.
- Shared router/schema/bootstrap wiring is performed separately by the central integration flow.
- Passwords must never be stored or logged in plaintext.
- Session cookies are opaque, HttpOnly credentials; only a one-way token hash is stored server-side.
- Authentication changes must not silently alter game economy, wallet balances, or game rules.

## Current milestones
- 2026-09-27 — Email/password auth foundation validated — isolated users/session schema, scrypt password hashing, opaque hashed server sessions, register/login/logout/me API, no-store auth responses and account UI all pass repository typecheck + production build; Account ownership guard is green. Preview promotion is currently blocked only by an unrelated pre-existing Idle UI regression. Next: central route/schema wiring after that blocker, then email verification/reset and account-to-wallet identity migration.
