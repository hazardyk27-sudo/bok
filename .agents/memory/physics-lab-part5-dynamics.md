---
name: Physics Lab Part 5 dynamics
description: Full roulette-chain acceptance needs a sloped inward transition and a spindle guard, not flat step rings.
---

Part 5’s physical chain is reliable when the inner bowl transition is a radial slope and the center has a collision guard matching the visual spindle; flat transition steps can hold the ball at an impossible resting band, while removing support causes escape.

Short, real Part 5 probes around the validated baseline showed that scalar tuning alone did not reach the two-lap requirement: gravity -58.86 with speed 6 and the default contact parameters remained near 1.2 first-chain laps, while tested changes to gravity, ball/bowl friction, spin, damping, and restitution were equal or worse.

The smallest stable support-lip lift after the flat release edge improved three individual smoke spins from 1.20/0.78/1.07 laps to 1.41/1.46/1.47 while preserving natural exit, inward descent, deflector, fret, pocket, and stable settle; stronger lifts became less consistent without reaching two laps.

Adding intermediate radial samples for a smoother lip curvature raised the short-smoke result to 1.51/1.53/1.58 laps with all downstream gates intact, but still did not reach two laps; treat this as the current geometry ceiling until a new radial-energy hypothesis exists.

Exit diagnostics place the ordinary loss at the inner edge of the outer-flat band (radius about 2.353–2.355, inward radial velocity, tangential speed about 1.0–1.7), not at the outer berm; a roughly 3 mm inner trough keeps 2.2–2.4 laps but traps the ball outside the inward chain, while a sub-millimeter trough preserves descent but stays below two laps.

A monotonic inner-edge S-ramp that steepened outward support did not solve the tradeoff: all three short spins stalled near radius 2.61 after only 0.21 lap, with no inward chain. Do not reuse that slope pattern without a new contact-energy hypothesis.

Direct normalized GLB sampling shows the low-poly profile is about 10–14 mm too high through radius 2.668–2.801 versus the Object_61/63/64 support envelope; replacing those samples with the measured envelope lowered smoke laps to 1.09–1.25 while preserving the full downstream chain, so the safe shallow profile remains the retained baseline.

The 1.09–1.25 result belongs to the measured-GLB replacement profile, not to a post-rollback smoke of the retained shallow baseline; runtime launch, material, gravity, timestep, rotor, and lap criteria match the earlier safe snapshot. Treat the post-rollback baseline as unverified rather than as runtime drift.

**Why:** Fifty-spin runtime audits exposed both failure modes: low-speed resting on the flat transition and center-floor traps. The sloped transition preserves gravity/friction support while allowing inward movement, and the spindle guard prevents the ball from crossing the pocket basin.

**How to apply:** Keep the Part 4 dynamic rotor unchanged, preserve the -58.86/default-contact baseline, and do not strengthen this lip further without a new radial-energy hypothesis. When adjusting Part 5 geometry, validate the complete 50-spin chain at fixed 120 Hz with stable-window settling and separate escape, trap, tunneling, and velocity-explosion counters.