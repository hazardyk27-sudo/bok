# Roulette 2D operating notes

## Ownership
- Canonical development branch: `feature/roulette-2d`.
- Owned root: `artifacts/cascade-8/src/roulette`.
- Do not reuse files, physics, assets, geometry, constants, or implementation details from the retired 3D Roulette.
- Shared routing, ownership, wallet/session wiring, package files, and preview infrastructure remain platform-owned.
- Replit remains on `integration/replit-preview`; normal Roulette work happens only on the feature branch.

## Product direction
- Build a realistic top-down 2D / 2.5D European single-zero roulette.
- The visual reference is a clean top-down wooden wheel with gold trim, an outer wooden annulus, a numbered ring, a broad green pocket ring, a wooden center disc, and a gold center mechanism.
- The first wheel is procedural Canvas 2D; no 3D engine, GLB, Rapier, or legacy Roulette assets.
- Winning outcomes will later come from simulation state, not target-number steering, snapping, magnets, or post-selection.

## Current milestones
- 2026-09-28 — Clean Roulette 2D category initialized. Reference-led wheel reconstruction is the active direction. Next: Part 1 geometry/wireframe — responsive canvas, canonical 37-number config, concentric ring radii, segment geometry and static reference-matched proportions.
