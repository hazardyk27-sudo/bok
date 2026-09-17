---
name: Physics Lab Part 4 dynamics
description: Durable constraints for coupled roulette rotor and ball runtime validation.
---

Dynamic rotor colliders must not solve collisions against overlapping stationary bowl colliders; both bodies should still collide with the ball. The rotor pocket floor must be vertically aligned with the bowl transition so a ball can transfer energy through actual moving contact instead of settling on a lower stationary floor.

**Why:** A rotating body sharing space with stationary bowl segments creates artificial velocity explosions and escapes. A pocket floor below the bowl floor produces a visually plausible inner settle with no rotor contact energy.

**How to apply:** Use separate rotor/stationary collision groups, keep the ball in both filter masks, and calibrate release radius/height inside a tested track-transition band. Validate the full 20-spin sample at fixed timestep; a short pilot can miss index-dependent release failures.

The stationary outer ball track should have a shallow inward slope, and the dynamic sphere’s launch center must be derived from the sloped top-surface normal rather than a nominal vertical offset. Acceptance must verify real launch contact pairs and contact-phase continuity before allowing the ball to leave the track.

**Why:** A flat outer ring either traps a ball at the track radius or requires an unrealistically large inward launch component; a visual-only height check cannot distinguish physical contact from a hovering mesh.

**How to apply:** Keep the track stationary and collision-driven, set the initial linear velocity tangential with no scripted position correction, and run the complete 20-spin fixed-step audit with explicit contact, floating, tunneling, and velocity checks.