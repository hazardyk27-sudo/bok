# Roulette 2D operating notes

## Ownership
- Canonical development branch: `feature/roulette-2d`.
- Owned root: `artifacts/cascade-8/src/roulette`.
- Do not reuse files, physics, assets, geometry, constants, or implementation details from the retired 3D Roulette.
- Shared routing, ownership, wallet/session wiring, package files, and preview infrastructure remain platform-owned.
- Replit remains on `integration/replit-preview`; normal Roulette work happens only on the feature branch.

## Product direction
- Build a realistic top-down 2D / 2.5D European single-zero roulette.
- Primary visual reference: clean top-down wooden roulette wheel supplied by the user on 2026-09-28; geometry and proportions should be reconstructed from that reference rather than improvised.
- The wheel uses a wooden outer annulus with gold trim/markers, an inward/radially oriented numbered ring, a broad green pocket ring, a wooden center disc, and a four-arm gold center mechanism.
- The first wheel is procedural Canvas 2D; no 3D engine, GLB, Rapier, or legacy Roulette assets.
- Winning outcomes will later come from simulation state, not target-number steering, snapping, magnets, or post-selection.

## Current milestones
- 2026-09-28 — Part 6 stator/rotor separation implemented — the outer wooden rim/markers now render in a fixed stator layer while the number ring, green pocket ring, center disc and gold mechanism render inside one independent rotor transform driven by a normalized `rotorAngle`. The view state already carries the rotor angle but remains static at zero; no spin timing or physics has been introduced yet. Next: Part 7 adds the first deterministic wheel-spin animation/state update while preserving the fixed stator.
- 2026-09-28 — Part 5 material polish implemented — outer stator wood now has deterministic grain arcs, richer mahogany radial shading, varnish sheen, panel seam depth, multi-line gold bevels and polished raised gold markers; the center wood disc received matching grain/bevel polish.
- 2026-09-28 — Part 4 center mechanism implemented — the reference-style central assembly now has three concentric gold base tiers, four rotated gold arms, spherical end knobs, a raised central hub and layered shadow/specular treatment, all constrained inside the wooden center disc.
- 2026-09-28 — Part 3 green pocket ring implemented — the broad reference-led green annulus now has 37 procedural sectors, layered radial green depth, stronger gold pocket separators, inner/outer beveled rails, a recessed trough shadow and subtle center sheen.
- 2026-09-28 — Part 2 number ring refinement implemented — reference-matched narrower number band, canonical colors, radial inward number orientation, condensed serif treatment, gold divider shadows/highlights and beveled inner/outer rails are now encoded procedurally.
- 2026-09-28 — Part 1 wheel geometry implemented — responsive high-DPI Canvas renderer, canonical 37-number European sequence, reference-led concentric ring ratios, inward/radial number orientation, eight outer rim markers, green pocket segmentation and wooden center guide are in place.
- 2026-09-28 — Clean Roulette 2D category initialized. Reference-led wheel reconstruction is the active direction.
