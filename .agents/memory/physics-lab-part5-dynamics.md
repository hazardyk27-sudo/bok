---
name: Physics Lab Part 5 dynamics
description: Full roulette-chain acceptance needs a sloped inward transition and a spindle guard, not flat step rings.
---

Part 5’s physical chain is reliable when the inner bowl transition is a radial slope and the center has a collision guard matching the visual spindle; flat transition steps can hold the ball at an impossible resting band, while removing support causes escape.

Short, real Part 5 probes around the validated baseline showed that scalar tuning alone did not reach the two-lap requirement: gravity -58.86 with speed 6 and the default contact parameters remained near 1.2 first-chain laps, while tested changes to gravity, ball/bowl friction, spin, damping, and restitution were equal or worse.

**Why:** Fifty-spin runtime audits exposed both failure modes: low-speed resting on the flat transition and center-floor traps. The sloped transition preserves gravity/friction support while allowing inward movement, and the spindle guard prevents the ball from crossing the pocket basin.

**How to apply:** Keep the Part 4 dynamic rotor unchanged and preserve the -58.86/default-contact baseline unless a transition or release-contact hypothesis explains the change. When adjusting Part 5 geometry, validate the complete 50-spin chain at fixed 120 Hz with stable-window settling and separate escape, trap, tunneling, and velocity-explosion counters.