---
name: Special symbol RTP calibration
description: The requested high Core cell probabilities interact strongly with sequence-level multiplier settlement.
---

High per-cell Core probabilities must be evaluated together with the full sequence-level multiplier settlement. A 2% Base refill Core rate and 7% Bonus Core rate, combined with the requested 2x–1000x weighted values, can produce extreme RTP even when the ordinary hit rate stays stable.

**Why:** A Core multiplies the accumulated tumble pool, and Free Spin initial boards can contain many Core opportunities. Independent per-cell odds therefore compound across the board and across tumbles.

**How to apply:** Preserve explicitly requested cell probabilities only after running at least a 1M-spin simulation. If RTP leaves the target range, adjust an explicitly approved payout/math parameter rather than silently changing the requested probabilities.