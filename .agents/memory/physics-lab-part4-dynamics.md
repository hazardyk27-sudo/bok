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

Primitive track segments must be evaluated with the ball radius included in the tangent overlap budget; a segment width that looks non-overlapping for the collider can still create simultaneous neighboring contacts and a large solver impulse. Continuous annular meshes also require a direct isolated launch test before use.

**Why:** The current audit repeatedly showed the launch sphere entering multiple track contacts at the first segment transition, while a separately tested mesh reproduced an impulse despite apparently exact top-surface placement.

**How to apply:** Treat segment pitch, segment tangent half-width, ball radius, and corner clearance as one coupled geometry calculation; reject any track representation that cannot pass an isolated launch trace before running the full 20-spin suite.

High-speed outer-track traces must measure actual contact pairs, not only radius/height heuristics. Segmented cuboids, capsule rings, analytic floor/wall combinations, and a faceted annular trimesh can all look aligned while producing only a few contact frames followed by escape or a solver velocity spike.

**Why:** Isolated Rapier runs at the validated launch speed reproduced false support across several stationary shape representations; aggregate probe outcomes alone did not identify which stationary shape caused the impulse.

**How to apply:** Keep a track-only fixed-step harness available during geometry work; require continuous contact-phase evidence, bounded speed, and bounded radius before accepting a new collider or starting the coupled rotor suite.

The normalized GLB's rendered outer-track contact surface is below the original
physics model's local Y origin. Apply the same rigid Y translation to every
stationary collider, collider-debug mesh, and ball release position; never
apply it to the ball visual alone.

**Why:** The earlier Rapier validation passed while the rendered ball was still
visibly suspended because the physics model and normalized GLB had different
vertical origins. A ball-only offset would hide that mismatch.

**How to apply:** Treat visual track surface plus exactly one ball radius as the
ready center, keep `syncBallVisual()` as a direct body-pose copy, and rerun both
moving-rotor suites after any vertical calibration change.