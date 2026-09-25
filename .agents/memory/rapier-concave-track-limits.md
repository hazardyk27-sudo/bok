---
name: Rapier concave track limits
description: Durable findings about native Rapier 0.20 geometry for the roulette physics lab.
---

Rapier 0.20 has no native torus or annular concave primitive. A solid cylinder can keep a ball in bounds while falsely supporting it across the bowl; independent capsule, sphere, rounded-sector, or convex-decomposition rings can create seam contacts and solver impulses. A valid roulette track must therefore be evaluated as a genuinely concave support surface, not by broad category contact or radius alone.

**Why:** Track-only probes showed that broad disk support and fragmented convex rings can look stable while failing the required outer-wall support or producing escape/velocity explosions. The validation must distinguish floor and wall collider pairs and require consecutive qualifying contact frames before counting laps.

**How to apply:** Prefer a correctly constructed Rapier heightfield or shared-vertex trimesh only after an isolated fixed-step trace proves wall+floor support, at least two outer laps, bounded speed/radius, and a natural inward transition. For Rapier 0.20 heightfields, the height buffer uses column-major layout with `(nrows + 1) * (ncols + 1)` entries; a shorter `nrows * ncols` buffer traps the WASM constructor.

For the roulette source GLB, the stationary outer running surface and berm are in the `ROULETTE_MAIN_31` family, with `Object_61` supplying the outer profile and `Object_63/Object_64` continuing the inner bowl slope. A generated shared-vertex radial shell needs `TriMeshFlags.FIX_INTERNAL_EDGES | ORIENTED`; merge-only trimeshes produced seam impulses in the same launch trace. The source-aligned launch band is around 6 normalized world units/s; the old 13-unit approximation exceeded the measured berm and caused escapes.

**Why:** The mesh family classification and flag combination were established by comparing normalized GLB radial envelopes with fixed-step Rapier traces; the improvement was reproducible across 100 varied Part 4-band launches.

**How to apply:** Keep the GLB as a read-only measurement source, reconstruct only a low-poly shell, preserve shared profile vertices, use the fixed-edge/oriented flags, and re-calibrate release speed whenever the measured berm changes.