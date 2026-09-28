# Roulette 2D operating notes

## Ownership
- Canonical development branch: `feature/roulette-2d`.
- Owned root: `artifacts/cascade-8/src/roulette`.
- Do not reuse files, physics, assets, geometry, constants, or implementation details from the retired 3D Roulette.
- Shared routing, ownership, wallet/session wiring, package files, and preview infrastructure remain platform-owned.
- Replit remains on `integration/replit-preview`; normal Roulette work happens only on the feature branch.

## Product direction
- Build a realistic top-down 2D / 2.5D European single-zero roulette.
- Primary visual reference: clean top-down wooden roulette wheel supplied by the user on 2026-09-28; geometry and proportions are reconstructed from that reference rather than legacy 3D assets.
- The wheel uses a wooden outer annulus with gold trim/markers, a fixed outer ball track, four small fixed deflectors, an inward/radially oriented numbered ring, a broad green pocket ring, a wooden center disc, and a four-arm gold center mechanism.
- The wheel is procedural Canvas 2D; no 3D engine, GLB, Rapier, or legacy Roulette assets.
- Winning outcomes come only from final settled simulation geometry, never target-number steering, snapping, magnets, or post-selection.

## Current milestones
- 2026-09-28 — Live tuning Part 17 completed — the visible outer ball track is moved farther outward (0.852 path radius), the ball is held on it longer before descent, and rotor motion is slowed/shortened to a heavier ~2.2-revolution profile so it is nearly stopped before pocket capture. Capture is now gated by low rotor speed, settle uses the same 0.48 radial center as the rendered pocket trough, settle time is allowed to extend the animation, and a final geometry-derived nearest-pocket fallback prevents low-energy motion from freezing on a separator. Settled state cannot occur before rotor stop, removing the visible stop-then-reaccelerate lap. Next: Part 18 emits simulation-driven audio events for track roll, deflector hits, fret hits, pocket bounces and final settle.
- 2026-09-28 — Live visual tuning 1 completed — user preview review showed the ball orbit visually too close to the inner ring, the ball too small, and the rotor too fast. The fixed outer track is moved outward (path radius 0.835), gold rim markers are moved outward to preserve clearance, the rendered ball is enlarged exactly 30%, deflectors are moved into the revised transition band, and rotor launch speed is reduced from 14 to 8 rad/s with 0.35/s drag for a slower/heavier wheel while retaining a long decay. The motion still has no target-number or target-pocket steering.
- 2026-09-28 — Part 16 final calibration/regression harness completed — the deterministic launch envelope is broadened to independent rotor/ball start-angle spans, a canonical 20-seed regression set (61001–61020) and batch summary now verify settle/result coverage, replay determinism and pocket diversity, and runtime state/result metadata is cleared/rebuilt cleanly per spin. Canvas interaction received final pointer/focus polish. This completes the standalone Roulette 2D wheel/ball physics baseline; remaining work is integration/preview validation and any visual tuning found from live review, not another numbered physics part.
- 2026-09-28 — Part 15 final geometry result reader + deterministic seed replay implemented — the winning pocket is recomputed from final settled ball world angle relative to final rotor angle and cross-checked against captured geometry before mapping through the canonical European sequence.
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
- 2026-09-28 — Clean Roulette 2D category initialized.
