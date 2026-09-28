---
name: Bonus flow state ownership
description: Rules for keeping Auto Spin state separate from Free Spin bonus state.
---

The base-spin Auto loop owns Auto Spin consumption. A bonus may temporarily pause that loop, but Free Spin retriggers only change the bonus counter and must not consume or create Auto spins. Any pending Auto resume intent must be cleared when the player stops Auto before the bonus begins.

**Why:** Bonus playback has its own retrigger counter and user-controlled ceremony pauses; merging the two counters or keeping stale resume intent can restart Auto unexpectedly or skip spins.

**How to apply:** Store Auto continuation as explicit context at the base-spin bonus trigger, consume the base spin exactly once in the Auto loop, and resume only after bonus cleanup when the stored context and remaining Auto count are still valid.