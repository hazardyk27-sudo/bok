---
name: Roulette snapshot refresh
description: Phase-specific session refreshes must be edge-triggered when websocket snapshots are frequent.
---

When a roulette websocket phase requires a session-specific REST refresh, trigger it only on the phase transition, not on every snapshot received during that phase.

**Why:** The coordinator publishes repeated snapshots while a phase is active; refreshing on each one creates a request storm and can overwrite live state.

**How to apply:** Compare the previous and next phase in the client, then call the session refresh once when entering SETTLING or INTERMISSION.