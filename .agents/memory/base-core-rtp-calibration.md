---
name: Base Core RTP calibration
description: Why refill-only multiplier cores need full-sequence simulation calibration.
---

Base-game multiplier cores are sampled during refill positions that occur after wins, so their RTP impact is much larger than a naive chance × average-value estimate suggests.

**Why:** A low per-cell probability is conditioned on a winning tumble and can multiply a larger-than-average accumulated raw pool. A starting chance that looks rare can still move total RTP outside the target range.

**How to apply:** Re-run a sufficiently large full simulation after changing Base Core chance or value weights. Track refill-cell frequency, paid-spin frequency, value distribution, and total RTP together; do not calibrate from the per-cell probability alone.