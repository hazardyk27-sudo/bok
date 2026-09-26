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
