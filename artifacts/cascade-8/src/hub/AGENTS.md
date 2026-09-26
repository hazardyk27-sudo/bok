# Hub ownership

This directory belongs only to the main game selector / site hub.

- Hub work may modify files in this directory.
- Hub work must not modify Slot, Roulette, Cadı Kazan or Idle-owned files.
- Normal Hub work must not modify shared/platform files.
- Commit does not mean publish; preview promotion is handled centrally.

## Isolation v2 is active
- Work only on `feature/hub` and only inside Hub-owned roots from `.github/game-ownership.json`.
- Do not merge or push the whole feature branch into `integration/replit-preview`.
- Do not touch Replit. Replit stays on `integration/replit-preview`.
- A commit only saves Hub work. Preview release is a separate central promotion that copies only Hub-owned roots.
- If a task appears to require a game, wallet/platform, shared router/build/schema files, stop and hand it to the central integration conversation.
