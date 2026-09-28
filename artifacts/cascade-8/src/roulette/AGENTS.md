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
- 2026-09-28 — Part 11 fixed deflectors + collision response implemented — four small gold lozenge deflectors now sit in the fixed transition band between the ball track and rotating number ring. During descent, the ball trajectory is scanned against their real polar geometry; the first actual overlap produces deterministic energy loss plus damped tangential and outward impulses before inward descent resumes. Collision timing/index come only from ball radius/angle versus fixed deflector geometry; no target pocket or result lookup is involved. Next: Part 12 moves from the transition band into the rotating pocket/fret zone and introduces rotor-relative separator contact.
- 2026-09-28 — Part 10 inward descent implemented — ball motion is two-stage and speed-driven: it stays locked to the canonical outer track while angular velocity is above 9 rad/s, then an exponential inward radial pull begins automatically as angular speed falls.
- 2026-09-28 — Part 9 visual ball layer implemented — a shaded ivory ball with contact shadow/specular highlight renders as an independent layer on the fixed outer track and orbits counter to the rotor.
- 2026-09-28 — Part 8 fixed outer ball track implemented — a dedicated stator-side annular channel sits between the rotating number ring and outer gold markers.
- 2026-09-28 — Part 7 rotor spin motion implemented — the rotor uses a deterministic impulse + exponential-drag model.
- 2026-09-28 — Part 6 stator/rotor separation implemented — the fixed outer rim and rotating inner assembly render independently.
- 2026-09-28 — Part 5 material polish implemented — wood/gold material depth and deterministic grain were added.
- 2026-09-28 — Part 4 center mechanism implemented — the reference-style four-arm gold center assembly was added.
- 2026-09-28 — Part 3 green pocket ring implemented — the broad green 37-sector pocket annulus and gold separators were added.
- 2026-09-28 — Part 2 number ring refinement implemented — canonical number band typography/colors/rails were refined.
- 2026-09-28 — Part 1 wheel geometry implemented — responsive procedural Canvas geometry and canonical European order were established.
- 2026-09-28 — Clean Roulette 2D category initialized. Reference-led wheel reconstruction is the active direction.
