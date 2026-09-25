---
name: PART 1 rotor infrastructure
description: Scene-root and visual-rotor constraints established before Rapier integration.
---

The active `rou-lp-test-04.glb` visual scene uses one normalized wheel root at `[0, 0, 0]`, with outside and turret fixed below it and the inside mesh below a dedicated Y-only rotor pivot at the same origin. Visual test motion advances through a 120 Hz fixed-step angle state intended to become the shared source for a later Rapier kinematic rotor.

**Why:** Separating visual motion from colliders keeps PART 1 cheap and prevents hidden parent transforms, pivot offsets, or frame-time drift from contaminating later physics work.

**How to apply:** Keep the root and pivot transforms identity except for the pivot’s local Y rotation; later Rapier updates must consume the same angle state rather than introduce a second rotor clock.