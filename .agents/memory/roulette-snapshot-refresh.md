---
name: Roulette snapshot refresh
description: Phase-specific session refreshes must be edge-triggered when websocket snapshots are frequent.
---

When a roulette websocket phase requires a session-specific REST refresh, trigger it only on the phase transition, not on every snapshot received during that phase. Session-specific snapshots should also carry the current round's accepted bets so a reload can hydrate the table without a second betting submission.

**Why:** The coordinator publishes repeated snapshots while a phase is active; refreshing on each one creates a request storm and can overwrite live state. Without accepted bets in the snapshot, a reload can either erase a valid table or accidentally submit it again.

**How to apply:** Compare the previous and next phase in the client, then call the session refresh once when entering SETTLING or INTERMISSION. Mark hydrated bets as already accepted for that round so automatic close submission remains one-shot.