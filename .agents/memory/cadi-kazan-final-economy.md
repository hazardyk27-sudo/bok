---
name: Cadı Kazan final economy
description: Durable calibration rule for Advanced payout schedules and simulation interpretation.
---

Advanced Cadı Kazan payout tables use survival probability to target approximately 96% return at fixed cashout points, while high-risk schedules are capped at 1000x. The fixed `1-safe`, `3-safe`, `5-safe`, and conservative strategies are the intended RTP band; random and aggressive strategies must be reported separately because the cap necessarily reduces their long-run return.

**Why:** A 1000x maximum and a 96% aggressive-terminal RTP cannot both hold when the chance of surviving every cell is very small. Hiding that tradeoff would make the economy report misleading.

**How to apply:** Keep payout tables server-owned and data-driven, run deterministic 1M/10M simulations for every bomb count, and publish fixed-strategy RTP plus high-variance strategy results as separate metrics.