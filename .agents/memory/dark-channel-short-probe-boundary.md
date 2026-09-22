---
name: Dark-channel short-probe boundary
description: How to interpret a static PASS followed by an inward-drift failure in the recessed roulette channel.
---

A static center in the running floor envelope does not prove a tangential launch is contained. The probe must keep the ball center at least one ball radius beyond the channel's inner wall; a minimum radius below that center limit is an inner-transition containment failure even when Rapier still reports floor contact.

The transformed GLB inner-surface audit currently samples approximately r/Y = 2.1800/-0.3785, 2.2000/-0.3412, 2.2200/-0.3354, 2.2400/-0.3475, 2.2600/-0.3635, and 2.2700/-0.3610. A first multi-point sloped analytic revision still allowed the probe to drift farther inward, so do not accept an inward-shifted boundary merely because it increases the numerical clearance threshold.

**Why:** Continuous contact with the analytic floor can continue while the ball has already crossed the valid radial envelope. Treating that state as stable hides an inward transition problem and makes later lap tuning misleading.

**How to apply:** Report the floor center envelope, minimum radius, inward drift, and inner-clearance margin together. If the probe crosses the inner limit, stop and correct the physical inner transition/floor containment; do not compensate with radial force, speed reduction, or lap tuning.