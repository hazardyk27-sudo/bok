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
- The wheel uses a wooden outer annulus with gold trim/markers, an inward/radially oriented numbered ring, a broad green pocket ring, a wooden center disc, and later a gold center mechanism.
- The first wheel is procedural Canvas 2D; no 3D engine, GLB, Rapier, or legacy Roulette assets.
- Winning outcomes will later come from simulation state, not target-number steering, snapping, magnets, or post-selection.

## Current milestones
- 2026-09-28 — Part 1 wheel geometry implemented — responsive high-DPI Canvas renderer, canonical 37-number European sequence, reference-led concentric ring ratios, inward/radial number orientation, eight outer rim markers, green pocket segmentation and wooden center guide are in place. Next: visually inspect proportions against the supplied reference, then Part 2 refines the number ring typography/borders and exact reference matching.
- 2026-09-28 — Clean Roulette 2D category initialized. Reference-led wheel reconstruction is the active direction.
