# Slot ownership

This directory is the Slot frontend ownership root.

Normal Slot work may modify this directory plus the Slot-owned config, engine, game, simulation and API roots declared in `.github/game-ownership.json`.

Slot work must not modify Roulette, Cadı Kazan, Idle, Hub, or shared/platform files.

The Slot route markup, controller bootstrap and Slot stylesheet are owned here. A Slot commit never publishes itself to Replit; only the central one-game promotion workflow may update the Slot slice of `integration/replit-preview`.

## Isolation v2 is active
- Work only on `feature/slot` and only inside Slot-owned roots from `.github/game-ownership.json`.
- Do not merge or push the whole feature branch into `integration/replit-preview`.
- Do not touch Replit. Replit stays on `integration/replit-preview`.
- A commit only saves Slot work. Preview release is a separate central promotion that copies only Slot-owned roots.
- If a task appears to require Hub, another game, wallet/platform, shared router/build/schema files, stop and hand it to the central integration conversation.

## Milestone continuity
- At the start of a new conversation, read this file and `Current milestones` once. Keep them in context and do not re-read them for each later command unless the rules/milestones actually changed or the conversation switches category/repository.
- Add a milestone only for durable state that the next agent would otherwise have to rediscover: an important decision, completed phase, validated baseline, major root cause/blocker, or next agreed checkpoint.
- Do not log routine micro-edits, every commit, raw test output, failed experiments, or temporary observations.
- Keep the list curated and short (normally 5–10 bullets), newest first. Replace or remove superseded items instead of appending forever.
- Preferred format: `YYYY-MM-DD — Milestone — current result/state. Next: ...`
- Before a meaningful handoff/new chat, update this section if the durable state changed.
- This milestone section belongs to Slot; updating it is allowed on `feature/slot` because this `AGENTS.md` is inside the category's owned root.
- If a note conflicts with code/tests/ownership rules, the validated repository state wins.

## Current milestones
- 2026-09-28 — Quality-preserving Slot runtime performance pass — Tumble presentation now reuses the already-correct Phaser board between cascades when a full cell-by-cell symbol/stack/Core identity check matches; any mismatch automatically falls back to the original full render. This removes redundant 30-node destroy/recreate cycles and preserves existing Core/Scatter ambient tweens instead of rebuilding them every tumble. GameController listeners now use one AbortController, Slot mount viewport/modal listeners are lifecycle-scoped with remount cleanup, and hidden Big Win/bonus-summary overlays are visibility-gated with their infinite pseudo-element animations paused until visible. Visual styling, animation timings, game math, RTP, Scatter/Core probabilities and paytable are unchanged. Combined with the prior lossless special-asset pass, the remaining priority is measured desktop/mobile runtime profiling after preview promotion (FPS, maxFrameGap, long tasks, reused-vs-fallback board renders).
- 2026-09-28 — Slot special-asset optimization — Core/Scatter runtime assets were resized to conservative >=2x display resolution and converted to lossless WebP. The 13 special assets dropped from 32.641 MB to 1.592 MB (-95.12%); decoded WebP was pixel-identical to each resized PNG reference (AE=0 for every asset). Runtime now loads the `.webp` files; oversized PNG copies were removed from `public/special-symbols`. Team-logo assets were left unchanged because the full 9-logo set is already only ~110 KB. Game Ownership Guard passed on the final asset-path commit.
- 2026-09-28 — Base/FS initial diversity split — The 8-distinct-normal-symbol initial cap now applies only to `BONUS_INITIAL`; Base initial generation may use all 9 normal symbols, and refills remain free to introduce the ninth symbol. Regression coverage explicitly verifies Base-initial ninth-symbol allowance and Free-Spin-initial blocking. Simulator diversity reporting now treats Base initial ninth-symbol boards as allowed and reserves limit violations for Free Spin initial boards. FS Core tuning is intentionally not changed in this checkpoint because raising the current 45%+ initial-Core-presence rate without compensating elsewhere would raise FS RTP.
- 2026-09-28 — 5M current-math validation — With initial-only 8-symbol cap, refill ninth-symbol allowed, FS initial Scatter 2.0%, FS initial Core 3.3%, FS refill Core 4.5%: 5,000,000 paid spins produced 131.1697% overall RTP (90.1837% Base + 40.9860% FS), 42.1783% hit rate, bonus 1/154.53, 11.6614 average FS/bonus, 14.0994% bonus-session retrigger rate, 0 initial boards over the 8-symbol cap, and 11.8253% of refill boards showing all 9 normal symbols. Core uplift contributed 65.5950 RTP points. Same-seed controls: old refill-8 + old FS rates 132.9258%; refill-9 + old FS rates 128.9809%; current FS tuning restored +2.1888 RTP points versus the refill-9/old-FS control while reducing retriggers. Treat current RTP as still materially above tuning target before further balancing.
- 2026-09-28 — Initial-only eight-symbol diversity cap — Base and Free Spin initial boards may contain at most 8 distinct normal symbols; a 9th distinct normal symbol is forbidden only during initial generation. Refill/tumble generation is uncapped across the 9-symbol pool and may introduce the missing 9th symbol onto a board that previously showed 8. `ColumnStream` now applies the visible-symbol filter only to `BASE_INITIAL` / `BONUS_INITIAL`; regression coverage locks both initial rejection and refill allowance, and simulator reporting treats refill 9th-symbol boards as allowed rather than cap violations. Next: rerun current full-spin simulation before any RTP/hit-rate tuning because refill diversity changed.
- 2026-09-26 — Isolation v2 active — Slot development stays on `feature/slot`; preview release is ownership-scoped into `integration/replit-preview`, not a whole-branch merge.

