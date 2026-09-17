---
name: Rapier concave track limits
description: Durable findings about native Rapier 0.20 geometry for the roulette physics lab.
---

Rapier 0.20 has no native torus or annular concave primitive. A solid cylinder can keep a ball in bounds while falsely supporting it across the bowl; independent capsule, sphere, rounded-sector, or convex-decomposition rings can create seam contacts and solver impulses. A valid roulette track must therefore be evaluated as a genuinely concave support surface, not by broad category contact or radius alone.

**Why:** Track-only probes showed that broad disk support and fragmented convex rings can look stable while failing the required outer-wall support or producing escape/velocity explosions. The validation must distinguish floor and wall collider pairs and require consecutive qualifying contact frames before counting laps.

**How to apply:** Prefer a correctly constructed Rapier heightfield or shared-vertex trimesh only after an isolated fixed-step trace proves wall+floor support, at least two outer laps, bounded speed/radius, and a natural inward transition. For Rapier 0.20 heightfields, the height buffer uses column-major layout with `(nrows + 1) * (ncols + 1)` entries; a shorter `nrows * ncols` buffer traps the WASM constructor.