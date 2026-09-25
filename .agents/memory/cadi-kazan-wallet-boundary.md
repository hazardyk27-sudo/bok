---
name: Cadı Kazan wallet boundary
description: The durable wallet and isolated round accounting decision for the scratch game.
---

Cadı Kazan uses the existing server-side roulette session cookie and wallet balance so its stake and payout movements remain server-authoritative and compatible with the live table balance. Its round state and ledger stay in dedicated tables; do not fold scratch-specific state into roulette rounds or bets.

**Why:** The scratch game needed a shared balance without changing roulette behavior or exposing bomb/payout decisions to the browser.

**How to apply:** Preserve the wallet row lock and unique ledger-key settlement pattern when adding scratch features. Treat the Advanced payout table as replaceable calibration, not a client-controlled value.