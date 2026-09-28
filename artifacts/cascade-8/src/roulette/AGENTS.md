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
- The wheel uses a wooden outer annulus with gold trim/markers, a fixed outer ball track, four small fixed deflectors, an inward/radially oriented numbered ring, a broad green pocket ring, a wooden center disc, and a four-arm gold center mechanism.
- The first wheel is procedural Canvas 2D; no 3D engine, GLB, Rapier, or legacy Roulette assets.
- Winning outcomes will later come from simulation state, not target-number steering, snapping, magnets, or post-selection.

## Current milestones
- 2026-09-28 — Part 12 rotor-relative fret entry implemented — ball motion now has a third speed-driven pocket-entry stage after the fixed-deflector descent. The ball crosses into the green pocket annulus, compares its world angle against all 37 separator angles after applying the live rotor transform, and records the first real separator overlap. Contact reflects rotor-relative tangential velocity with restitution plus a small damped outward radial impulse; no pocket number is selected or looked up. The active rotor spin is now passed into ball simulation so separator geometry is evaluated at the correct rotating angle. Next: Part 13 supports repeated pocket/fret bounces with cumulative energy loss instead of only the first fret contact.
- 2026-09-28 — Part 11 fixed deflectors + collision response implemented — four small fixed gold deflectors use real polar overlap during descent; the first contact creates deterministic damped tangential/outward response.
- 2026-09-28 — Part 10 inward descent implemented — ball motion is speed-driven from fixed outer track into the transition band.
- 2026-09-28 — Part 9 visual ball layer implemented — the shaded ivory ball renders and orbits independently.
- 2026-09-28 — Part 8 fixed outer ball track implemented.
- 2026-09-28 — Part 7 rotor spin motion implemented.
- 2026-09-28 — Part 6 stator/rotor separation implemented.
- 2026-09-28 — Part 5 material polish implemented.
- 2026-09-28 — Part 4 center mechanism implemented.
- 2026-09-28 — Part 3 green pocket ring implemented.
- 2026-09-28 — Part 2 number ring refinement implemented.
- 2026-09-28 — Part 1 wheel geometry implemented.
- 2026-09-28 — Clean Roulette 2D category initialized. Reference-led wheel reconstruction is the active direction.
