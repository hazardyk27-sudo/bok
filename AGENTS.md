# OYUN repository operating rules

This repository contains multiple games that must be developed and released independently.

## Permanent branch model
- Slot work: `feature/slot`
- Roulette work: `feature/roulette`
- Cadı Kazan work: `feature/cadi-kazan`
- Idle / İşletmeler work: `feature/idle`
- Shared Replit preview: `integration/replit-preview`
- Replit must stay on `integration/replit-preview`.

## Isolation rules
1. A game task may only modify files owned by that game in `.github/game-ownership.json`.
2. Never modify another game's owned files.
3. Shared/platform files are not part of a normal game update. If a shared file must change, stop and treat it as a separate platform change.
4. Committing to a feature branch does NOT publish to Replit.
5. Promotion to preview must use the game promotion workflow; do not merge an entire feature branch into the preview branch.
6. Promotion must preserve every non-target game's tree exactly.
7. No reset --hard, rebase, force-push, or branch switching in Replit.
8. Do not make design or behavior changes while performing structural isolation/refactors.
9. The current working game version is the source of truth while migrating; move code without redesigning it.
10. If ownership is unclear, stop instead of touching a shared or foreign file.

## Goal
Routine Slot updates must have zero file changes in Roulette, Cadı Kazan, Idle and Hub. The same rule applies symmetrically to every game.
