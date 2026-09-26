# Cadı Kazan ownership

This directory is the Cadı Kazan frontend ownership root.

Cadı Kazan work may modify this directory and the Cadı Kazan API root declared in `.github/game-ownership.json`.

Cadı Kazan work must not modify Slot, Roulette, Idle, Hub, or shared/platform files during a normal game update.

The scratch system, styles, route mount, client, and Cadı-specific audio runtime are owned here. A Cadı Kazan commit does not publish itself to Replit; only the central one-game promotion workflow may update the Cadı Kazan slice of `integration/replit-preview`.

## Isolation v2 is active
- Work only on `feature/cadi-kazan` and only inside Cadı Kazan-owned roots from `.github/game-ownership.json`.
- Do not merge or push the whole feature branch into `integration/replit-preview`.
- Do not touch Replit. Replit stays on `integration/replit-preview`.
- A commit only saves Cadı Kazan work. Preview release is a separate central promotion that copies only Cadı Kazan-owned roots.
- If a task appears to require Hub, another game, wallet/platform, shared router/build/schema files, stop and hand it to the central integration conversation.
