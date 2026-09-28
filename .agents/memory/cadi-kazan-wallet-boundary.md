---
name: Cadı Kazan wallet boundary
description: The durable wallet and isolated round accounting decision for the scratch game.
---

Cadı Kazan uses the shared server-side game session and wallet balance so its stake and payout movements remain server-authoritative and compatible with the other live games. Its round state and ledger stay in dedicated tables; do not fold scratch-specific state into another game's rounds or bets.

**Why:** The scratch game needs a shared balance without exposing bomb/payout decisions to the browser.

**How to apply:** Preserve the wallet row lock and unique ledger-key settlement pattern when adding scratch features. Treat the Advanced payout table as replaceable calibration, not a client-controlled value.
