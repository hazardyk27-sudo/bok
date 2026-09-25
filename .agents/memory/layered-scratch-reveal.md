---
name: Layered scratch reveal
description: Durable rendering rule for the Cadı Kazan scratch interaction.
---

Cadı Kazan scratch surfaces must keep the result layer opaque during shallow abrasion. Accumulate depth per local grid cell; draw source-over scuff marks first and only use destination-out for a cell after its local depth threshold is reached. The global coverage threshold then commits the server reveal, followed by the short full-clear animation.

**Why:** A destination-out stroke against a result layer reveals the symbol on the first touch, which violates the intended repeated-abrasion interaction even if a global coverage counter is present.

**How to apply:** Preserve local depth state through the gesture, keep short strokes non-committing, and test both a single tap and repeated passes before changing brush alpha or reveal thresholds. Start the full-clear only after the server result resolves; otherwise repeated destination-out frames can consume the mask before the real symbol is painted. When a clear is animated with destination-out, apply incremental per-frame alpha rather than the total progress alpha on every frame.