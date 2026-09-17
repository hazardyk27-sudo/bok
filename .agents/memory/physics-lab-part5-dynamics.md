---
name: Physics Lab Part 5 dynamics
description: Full roulette-chain acceptance needs a sloped inward transition and a spindle guard, not flat step rings.
---

Part 5’s physical chain is reliable when the inner bowl transition is a radial slope and the center has a collision guard matching the visual spindle; flat transition steps can hold the ball at an impossible resting band, while removing support causes escape.

**Why:** Fifty-spin runtime audits exposed both failure modes: low-speed resting on the flat transition and center-floor traps. The sloped transition preserves gravity/friction support while allowing inward movement, and the spindle guard prevents the ball from crossing the pocket basin.

**How to apply:** Keep the Part 4 dynamic rotor unchanged. When adjusting Part 5 geometry, validate the complete 50-spin chain at fixed 120 Hz with stable-window settling and separate escape, trap, tunneling, and velocity-explosion counters.