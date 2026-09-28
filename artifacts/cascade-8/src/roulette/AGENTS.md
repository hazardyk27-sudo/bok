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
- 2026-09-28 — Part 13 repeated fret bounce chain implemented — pocket-entry now discovers a chronological chain of rotor-relative separator contacts instead of stopping at the first hit. Each overlap is derived from the simulated ball position versus all live rotating separators, with contact gating/cooldown to prevent duplicate manifold hits. Every successive bounce uses lower effective restitution and a smaller outward radial impulse, so relative collision energy dissipates cumulatively while the ball travels across multiple neighboring frets. The sample state now reports cumulative fret-contact count and latest separator contact; there is still no target pocket or selected result. Next: Part 14 adds pocket capture/settle criteria so the low-energy ball can remain inside one rotating pocket rather than ending at a generic handoff radius.
- 2026-09-28 — Part 12 rotor-relative fret entry implemented — the ball crosses into the green pocket annulus and its first real rotating separator overlap reflects rotor-relative tangential velocity.
- 2026-09-28 — Part 11 fixed deflectors + collision response implemented — four small fixed gold deflectors use real polar overlap during descent.
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
