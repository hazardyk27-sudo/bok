---
name: Physics Lab Part 4 dynamics
description: Durable constraints for coupled roulette rotor and ball runtime validation.
---

Dynamic rotor colliders must not solve collisions against overlapping stationary bowl colliders; both bodies should still collide with the ball. The rotor pocket floor must be vertically aligned with the bowl transition so a ball can transfer energy through actual moving contact instead of settling on a lower stationary floor.

**Why:** A rotating body sharing space with stationary bowl segments creates artificial velocity explosions and escapes. A pocket floor below the bowl floor produces a visually plausible inner settle with no rotor contact energy.

**How to apply:** Use separate rotor/stationary collision groups, keep the ball in both filter masks, and calibrate release radius/height inside a tested track-transition band. Validate the full 20-spin sample at fixed timestep; a short pilot can miss index-dependent release failures.