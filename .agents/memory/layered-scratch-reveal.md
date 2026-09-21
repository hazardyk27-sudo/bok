---
name: Layered scratch reveal
description: Durable rendering rule for the Cadı Kazan scratch interaction.
---

Cadı Kazan scratch surfaces must keep the result layer opaque during shallow abrasion. Accumulate depth per local grid cell; draw source-over scuff marks first and only use destination-out for a cell after its local depth threshold is reached. The global coverage threshold then commits the server reveal, followed by the short full-clear animation.

**Why:** A destination-out stroke against a result layer reveals the symbol on the first touch, which violates the intended repeated-abrasion interaction even if a global coverage counter is present.

**How to apply:** Preserve local depth state through the gesture, keep short strokes non-committing, and test both a single tap and repeated passes before changing brush alpha or reveal thresholds.