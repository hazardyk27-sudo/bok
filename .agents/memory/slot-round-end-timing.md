---
name: Slot round-end timing
description: Boundary for removing slot round dead-time without changing visual motion
---

Round completion should return immediately after the final required settlement tween; do not add a post-core hold, while preserving initial drop, refill, Turbo/normal timing, easing, stagger, and required settlement presentation.

**Why:** The visible dead-time came from completion barriers and per-core minimum/hold timing, especially in Turbo, not from a required result hold.

**How to apply:** Keep promise completion aligned with the last visible tween, skip no-op motion barriers, scale core phases from the already-scaled duration, and avoid sequential sleeps after core collection.