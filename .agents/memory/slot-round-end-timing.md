---
name: Slot round-end timing
description: Boundary for removing slot round dead-time without changing visual motion
---

Keep round completion to one short post-settlement hold. Remove duplicate or unexplained waits after the final amount is already displayed, but preserve initial drop, refill, Turbo/normal timing, easing, stagger, and required settlement presentation.

**Why:** A duplicated end-of-round delay made the board appear frozen after the result was already final, while the user explicitly treats the current drop and refill animation as the visual baseline.

**How to apply:** Inspect the final settlement await chain separately from motion promises. Change only the redundant post-result wait; do not tune animation durations, easing, or state flow unless a separate request explicitly allows it.