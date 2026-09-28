---
name: Slot wallet authority
description: Durable trust boundary for the Cascade 8 slot wallet and legacy client balance migration
---

The Cascade 8 slot must use the shared server wallet as its only balance and payout authority. The server runs the existing slot math, records the round and ledger entries transactionally, and returns the result for client-side animation only. Legacy localStorage balance values are recorded once for migration audit but are never trusted as credits.

**Why:** A client can change localStorage or report a payout, so client-side balance persistence cannot safely participate in a shared wallet. Server-generated results and idempotent ledger writes prevent duplicate debits/credits across retries and game surfaces.

**How to apply:** Keep future slot UI changes presentation-only. Any stake, result, payout, retry, or migration behavior must go through the shared session wallet and a server-side idempotency key.