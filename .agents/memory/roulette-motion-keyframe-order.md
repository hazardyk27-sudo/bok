---
name: Roulette motion keyframe order
description: Generated roulette landing keyframes must remain monotonically ordered by offset.
---

When roulette landing keyframes are assembled from fixed trajectory points plus generated fret bounces, every offset must be non-decreasing.

**Why:** The Web Animations API rejects an animation with out-of-order offsets. The snapshot can already be stored before that exception, leaving the visible phase stale and hiding the real failure.

**How to apply:** Keep generated bounce offsets after the final fixed inward-track offset, and verify a RESULT transition in a browser test whenever the landing path changes.