# Account UI ownership

This directory belongs to the shared player-account experience.

- Work only on `feature/account` for normal account UI development.
- Do not modify game-owned UI from this category.
- Shared route/bootstrap and Hub integration are central integration responsibilities.
- Never place auth tokens or passwords in localStorage/sessionStorage.
- Authentication state comes from the server via `/api/auth/me`.

## Current milestones
- 2026-09-27 — Account page baseline — login/register/profile/logout UI exists as a self-contained route module using server-side cookie auth. Next: central route/API/schema wiring, validation, then email verification/password reset.
