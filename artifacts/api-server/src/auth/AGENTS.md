# Account / Auth ownership

This directory is the backend-owned root for the shared account system.

- Work only on `feature/account` for normal account/auth development.
- Do not modify game-owned files.
- Shared router/schema/bootstrap wiring is performed separately by the central integration flow.
- Passwords must never be stored or logged in plaintext.
- Session cookies are opaque, HttpOnly credentials; only a one-way token hash is stored server-side.
- Authentication changes must not silently alter game economy, wallet balances, or game rules.

## Current milestones
- 2026-09-27 — Email/password auth foundation started — users + server-side session schema, scrypt password hashing, and register/login/logout/me API module are the initial baseline. Next: validate, wire centrally, then add account UI and email-verification/reset flows.
