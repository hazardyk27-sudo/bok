---
name: Pair stream continuity
description: Boundary and special-symbol rules for the Cascade 8 normal-symbol stream.
---

A visible column consumes one continuous stream, so a five-cell initial board can end on the first member of a pair; the next refill must consume that pending second member before starting a new group.

**Why:** the odd board height makes visible/hidden boundaries fall halfway through a logical pair, and inserting a special between pair members creates a visible continuity break.

**How to apply:** preserve each column stream across initial boards and tumbles, allow specials only before a new normal group starts, and keep physical stream order aligned with incoming fall order.