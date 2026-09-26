# Roulette ownership

This directory is the Roulette frontend ownership root.

Roulette work may modify this directory and the other Roulette roots declared in `.github/game-ownership.json` (Roulette API/physics/config/scripts).

Roulette work must not modify:
- Slot-owned files
- Cadı Kazan-owned files
- Idle/İşletmeler-owned files
- Hub-owned files
- shared/platform files during a normal Roulette update

A Roulette commit never publishes itself to Replit. Only the central one-game promotion workflow may update the Roulette slice of `integration/replit-preview`.

## Isolation v2 is active
- Work only on `feature/roulette` and only inside Roulette-owned/development roots from `.github/game-ownership.json`.
- Do not merge or push the whole feature branch into `integration/replit-preview`.
- Do not touch Replit. Replit stays on `integration/replit-preview`.
- A commit only saves Roulette work. Preview release is a separate central promotion that copies only Roulette-owned roots.
- If a task appears to require Hub, another game, wallet/platform, shared router/build/schema files, stop and hand it to the central integration conversation.
