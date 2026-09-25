---
name: Outer wall cross-section measurement
description: How to measure the recessed roulette channel's retaining wall without mistaking the wood rim for the wall.
---

For the transformed roulette GLB, vertical top-down rays at radii near the outer boundary can select the higher wood/rim surface rather than the inner face of the recessed dark channel. Measure the retaining wall with horizontal radial rays at several heights and keep the first inward-facing hit in the outer-radius band.

**Why:** The wall is an approximately vertical inner face, while the wood top is higher. A top-down sample can therefore report a visually plausible but physically wrong wall height and make the analytic collider ramp away from the real channel.

**How to apply:** Use the transformed stationary group and the same azimuth used by the launch gate. Report the measured radial/height samples separately from the analytic profile, preserve a continuous floor-to-wall transition, and keep the visual WebGL gate independent from the physics report.