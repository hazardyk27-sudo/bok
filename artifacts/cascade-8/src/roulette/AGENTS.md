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
- Winning outcomes come from final settled simulation geometry, not target-number steering, snapping, magnets, or post-selection.

## Current milestones
- 2026-09-28 — Part 15 final geometry result reader + deterministic seed replay implemented — the winning pocket is now recomputed from the final settled ball world angle relative to the final rotor angle and cross-checked against the captured pocket before mapping through the canonical European sequence. The runtime exposes the verified pocket index/number/color only after settle. A stable seed hash/replay harness now derives small launch-angle initial-condition variations and reproduces the same full collision/capture/result state for the same seed; it never accepts a target number or pocket. Next: Part 16 broadens the seed envelope, runs multi-seed settle/result regression, calibrates edge cases, and applies final motion/visual polish.
- 2026-09-28 — Part 14 pocket capture + settle implemented — low-energy geometry captures the ball into a live rotating pocket and critically damps it to the pocket center/floor radius.
- 2026-09-28 — Part 13 repeated fret bounce chain implemented — pocket-entry discovers a chronological chain of rotor-relative separator contacts with progressively lower restitution and radial kick.
- 2026-09-28 — Part 12 rotor-relative fret entry implemented.
- 2026-09-28 — Part 11 fixed deflectors + collision response implemented.
- 2026-09-28 — Part 10 inward descent implemented.
- 2026-09-28 — Part 9 visual ball layer implemented.
- 2026-09-28 — Part 8 fixed outer ball track implemented.
- 2026-09-28 — Part 7 rotor spin motion implemented.
- 2026-09-28 — Part 6 stator/rotor separation implemented.
- 2026-09-28 — Part 5 material polish implemented.
- 2026-09-28 — Part 4 center mechanism implemented.
- 2026-09-28 — Part 3 green pocket ring implemented.
- 2026-09-28 — Part 2 number ring refinement implemented.
- 2026-09-28 — Part 1 wheel geometry implemented.
- 2026-09-28 — Clean Roulette 2D category initialized. Reference-led wheel reconstruction is the active direction.
