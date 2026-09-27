# Roulette ownership

This directory is the Roulette frontend ownership root.

Roulette work may modify this directory and the other Roulette roots declared in `.github/game-ownership.json` (Roulette API/physics/config/scripts).

Roulette work must not modify:
- Slot-owned files
- Cadı Kazan-owned files
- Idle/İşletmeler-owned files
- Hub-owned files
- shared/platform files during a normal Roulette update

A Roulette commit never publishes itself to Replit. Only the central one-game promotion workflow may update the Roulette slice of `integration/replit-preview`.

## Isolation v2 is active
- Work only on `feature/roulette` and only inside Roulette-owned/development roots from `.github/game-ownership.json`.
- Do not merge or push the whole feature branch into `integration/replit-preview`.
- Do not touch Replit. Replit stays on `integration/replit-preview`.
- A commit only saves Roulette work. Preview release is a separate central promotion that copies only Roulette-owned roots.
- If a task appears to require Hub, another game, wallet/platform, shared router/build/schema files, stop and hand it to the central integration conversation.

## Milestone continuity
- Read `Current milestones` before starting substantial work in this category.
- Add a milestone only for durable state that the next agent would otherwise have to rediscover: an important decision, completed phase, validated baseline, major root cause/blocker, or next agreed checkpoint.
- Do not log routine micro-edits, every commit, raw test output, failed experiments, or temporary observations.
- Keep the list curated and short (normally 5–10 bullets), newest first. Replace or remove superseded items instead of appending forever.
- Preferred format: `YYYY-MM-DD — Milestone — current result/state. Next: ...`
- Before a meaningful handoff/new chat, update this section if the durable state changed.
- This milestone section belongs to Roulette; updating it is allowed on `feature/roulette` because this `AGENTS.md` is inside the category's owned root.
- If a note conflicts with code/tests/ownership rules, the validated repository state wins.

## Current milestones
- 2026-09-27 — Exact GLB Part 9 outer-lap calibration closed without forcing geometry — Extensive radius/speed/friction/gap/spin/restitution/trimesh-mode/outer-wall partition sweeps showed that a 4–5 lap result can be produced for an isolated seed but does not generalize safely across deterministic seeds while preserving the exact-GLB-only contract. The strongest candidate (`radius 2.46`, `6.45 m/s`, stationary friction `0.028`, split outer-wall friction `0`) produced `4.237` continuous outer laps for seed 61007 and settled safely, but 61014/61011 escaped and 61012/61009 remained below `0.5` lap. Therefore no hidden wall, force, teleport, geometry inflation, or seed-specific tuning was adopted. All temporary Part 9 calibration overrides were removed in commit `850d012f0834c163d5331238990bfd522a78a733`; outer-lap checking is retained as a diagnostic rather than a hard five-lap gate. On that cleanup baseline, 7-seed settle, GLB mapping, authoritative replay, Part 5 exact-collider contract, Part 6 contact micro-parity, settled-result contract, Part 8 pocket/settle, and ownership guard all passed. Evidence: candidate run `36324020692`; cleanup diagnostics/regression runs under commit `850d012f0834c163d5331238990bfd522a78a733`. Next: Part 10 resolves server/production trajectory parity, including the known server seed 61006 divergence.
- 2026-09-27 — Exact GLB Part 8 physical pocket entry + stable settle closed — Validated browser visual-GLB physics passed dedicated pocket/settle gate 20/20 for seeds 61001–61020: every seed physically entered a pocket, contacted the exact rotating GLB with micro-parity coverage, settled with rotor-relative speed `<0.12`, produced a non-null relative-angle pocket index/number, and had no clipping, tunneling, escape, velocity spike, artificial acceleration, or safety failure. Settle times ranged 2.3667–5.4 s; worst final rotor-relative speed was 0.0649. Evidence: workflow run `36286962214`, scoped gate head `5f73b515a9674b4940d45b34762ec13aa656b660`. A separate server seed 61006 numerical trajectory divergence was discovered during an over-broad Part 8 server check and is deferred to Part 10 server/production parity; it does not change the validated browser visual-GLB authority. Next: Part 9 full-chain 4–5 outer-lap calibration while preserving Part 4–8 containment/parity/settle gates.
- 2026-09-27 — Exact GLB Part 7 natural inward descent closed — Browser full-spin and server simulation loops contain no scripted ball translation/velocity/impulse/force after launch. Dedicated Part 7 gate passed server 61001–61005 with `TRACK_ENTRY → NATURAL_INWARD_EXIT → POCKET_ENTRY → STABLE_SETTLE`, and browser 61001–61020 passed 20/20 with energy loss before inward descent plus ordered `OUTER_RACE → INWARD_DESCENT → DEFLECTOR_ZONE → ROTOR_ENTRY → POCKET → SETTLED`; transition contacts used only exact-GLB roles and all seeds remained settled/safe. Evidence: workflow run `36286117603`; gate commit `64fe116c96d3c2416629fccd81bcedf58be17a67`. Next: Part 8 validates physical pocket entry and stable settle on the exact rotating rotor/pocket geometry.
- 2026-09-27 — Exact GLB Part 6 actual-contact micro-parity closed — Real contact frames now measure surface point, normal and ball-clearance parity instead of relying only on the static mesh scan. Dedicated 5-seed gate 61001–61005 passed on both runtimes: browser visual GLB ↔ Rapier and server exact GLB payload ↔ Rapier. Browser worst case: point `4.59e-7 wu`, normal `0.000079°`, clearance `4.40e-7 wu`; server worst case: point `3.84e-7 wu`, normal `0.000006°`, clearance `3.67e-7 wu`, all far inside the locked `0.0006 wu / 0.1°` limits. All browser seeds also remained settled/safe; all server seeds returned `SETTLED`. Evidence: workflow run `36285664752`; telemetry commit `15d6363329196505a088bae24872fdf622c4baa0`; gate commit `c4959ea270d7a90fc33c564cd532af9189bfbfce`. Next: Part 7 continues from the exact-GLB-only, contact-parity-validated baseline.
- 2026-09-27 — Exact GLB Part 5 hidden-collider cleanup closed — Browser full-spin and server simulation now hard-fail unless the active environment collider roles are exactly `exact-glb-stationary-trimesh` + `exact-glb-rotor-trimesh`; browser additionally requires `legacyColliderCount=0`. Dedicated workflow `Roulette Part 5 Exact GLB Collider Contract` passed source assertions, server runtime probe, and 5-seed browser regression with all five seeds settled/safe. Evidence: workflow run 36284802787; contract code commit `9389aad349accf68d89e119bd5cbb41e8403ea68`; gate fix head `14507f9cb87e6614b4bf602ba69b59b1f075aa0e`. No invisible wall/bridge/floor/fret/guard/support collider is active in the full-spin path. Next: Part 6 micro-parity/contact-surface validation on the exact-GLB-only world.
- 2026-09-27 — Exact GLB Part 4A/4B containment + settle baseline closed — Exact GLB surface placement plus mirrored browser/server `normal × radial` launch tangent at 5.0 m/s ±0.15 passes the 7-seed settle gate 7/7 and the dedicated Part 4B 20-seed gate 20/20 (61001–61020). Every 20-seed case settled with a non-null pocket result and `safetyPassed=true`; no escape, clipping, tunneling, velocity spike, artificial acceleration, or timeout was observed. Evidence: workflow run 36284003696 on commit `72aecd4ef11d4840d384da9a7910c7d7c30ca929`. The separate 5-lap calibration gate is a tuning criterion, not a Part 4B containment blocker. Next: continue Part 5 from this exact-GLB baseline.
- 2026-09-26 — Isolation v2 active — Roulette development stays on `feature/roulette`; preview release is ownership-scoped into `integration/replit-preview`, not a whole-branch merge.

