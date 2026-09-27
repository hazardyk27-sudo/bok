# Cadı Kazan ownership

This directory is the Cadı Kazan frontend ownership root.

Cadı Kazan work may modify this directory and the Cadı Kazan API root declared in `.github/game-ownership.json`.

Cadı Kazan work must not modify Slot, Roulette, Idle, Hub, or shared/platform files during a normal game update.

The scratch system, styles, route mount, client, and Cadı-specific audio runtime are owned here. A Cadı Kazan commit does not publish itself to Replit; only the central one-game promotion workflow may update the Cadı Kazan slice of `integration/replit-preview`.

## Isolation v2 is active
- Work only on `feature/cadi-kazan` and only inside Cadı Kazan-owned roots from `.github/game-ownership.json`.
- Do not merge or push the whole feature branch into `integration/replit-preview`.
- Do not touch Replit. Replit stays on `integration/replit-preview`.
- A commit only saves Cadı Kazan work. Preview release is a separate central promotion that copies only Cadı Kazan-owned roots.
- If a task appears to require Hub, another game, wallet/platform, shared router/build/schema files, stop and hand it to the central integration conversation.

## Milestone continuity
- Read `Current milestones` before starting substantial work in this category.
- Add a milestone only for durable state that the next agent would otherwise have to rediscover: an important decision, completed phase, validated baseline, major root cause/blocker, or next agreed checkpoint.
- Do not log routine micro-edits, every commit, raw test output, failed experiments, or temporary observations.
- Keep the list curated and short (normally 5–10 bullets), newest first. Replace or remove superseded items instead of appending forever.
- Preferred format: `YYYY-MM-DD — Milestone — current result/state. Next: ...`
- Before a meaningful handoff/new chat, update this section if the durable state changed.
- This milestone section belongs to Cadı Kazan; updating it is allowed on `feature/cadi-kazan` because this `AGENTS.md` is inside the category's owned root.
- If a note conflicts with code/tests/ownership rules, the validated repository state wins.

## Current milestones
- 2026-09-27 — The Office cutout matte fix — near-black matte pixels around the supplied character JPEGs are converted to transparency at render time, so the characters sit directly on the white scratch-result cells without black rectangles; source artwork sizing and prize badges stay unchanged.
- 2026-09-27 — The Office scratch UX pass — Office-only result backgrounds are white, no-prize completion now plays a negative cue, Office brush radius is increased another 10% from the prior 1.30× setting to 1.43× baseline, and one continuous pointer drag can scratch across multiple Office cells while Standard/Advanced keep single-cell routing.
- 2026-09-27 — The Office scratch brush +30% — only `OFFICE_MATCH_6` now uses a brush radius 1.3× the shared 14px baseline (18.2px effective). Standard/Advanced remain unchanged.
- 2026-09-27 — The Office prize-badge cleanup — character art is reduced by 10% from the previous 94% cell fit to 84.6%, the black character-name rectangle is removed, and each revealed symbol now displays its direct stake-derived prize amount (`stake × multiplier`) instead of 2x/5x/10x/20x/100x text. Example: $10 stake + Dwight 10x shows $100.
- 2026-09-27 — The Office character reveal render fix — Office result cells now explicitly suppress the generic Cadı Kazan safe-result sculpture/aura/pseudo-elements and give the supplied character artwork the entire scratch cell; character images remain `contain`-fit on black so none of the user-provided source composition is cropped. Next: promote to preview and visually verify all five character reveals.
- 2026-09-27 — The Office table registration/scratch interaction fix — cleared inherited top/left/translate offsets so the Office ticket centers exactly inside the table lane, and explicitly restored pointer/touch handling to the purchased lacquer canvas while keeping the unpaid preview non-interactive. Next: promote this fix to preview and verify the purchased card scratch path visually.
- 2026-09-27 — The Office full-flow contract coverage — added deterministic 10,000-outcome distribution checks, all five payout paths through third-match settlement, million-scale payout arithmetic, active-state symbol redaction, duplicate-reveal protection, and 100 loss-board completion sequences. GitHub Game Ownership Guard passes on the feature head. Next: promote this Cadı slice through the central preview workflow and run browser/Playwright desktop + four mobile landscape locks.
- 2026-09-27 — The Office win emphasis complete — completed winning cards derive the matched character from the server-visible terminal board, highlight exactly the three matching cells, and reserve the premium gold/ray celebration for Michael Scott 100x; reduced-motion users avoid the animated effects. Next: validate the full Office flow on desktop/mobile and add/refresh browser visual-interaction locks through the central preview/testing flow.
- 2026-09-27 — The Office reference-fit + live scratch coating — ticket geometry is tightened to the supplied black ~2.08:1 reference (left The Office/Parkour block, right 3×2 near-square fields), and the live scratch lacquer now uses the same “that's what she said” visual language as the idle preview. Desktop and both physical mobile orientations share the same horizontal composition. Next: add matched-triple win emphasis/Michael 100x celebration, then run desktop/mobile interaction and visual locks.
- 2026-09-27 — The Office character artwork wired — the five user-provided character images are optimized to WebP and live under the Cadı Kazan-owned `src/cadi-kazan/office/assets` tree so ownership-scoped preview promotion includes them; result cells reveal the configured character artwork plus multiplier, with Michael 100x receiving the gold special treatment. Mapping remains Kevin 2x / Jim 5x / Dwight 10x / Stanley 20x / Michael Scott 100x.
- 2026-09-27 — The Office client/deck scaffold wired — `OFFICE_MATCH_6` now appears in KARTLAR, uses 0-bomb/3-match rules, shows a dedicated black The Office ticket with left title/parkour panel and 3×2 scratch grid on desktop/mobile, consumes server-redacted revealed Office symbols, and keeps cash-out disabled. Character image assets are not yet wired; current live cells use name/multiplier placeholders. Next: bind the five provided character images and replace placeholder result cells with the final artwork treatment.
- 2026-09-27 — The Office round persistence/settlement wired — `OFFICE_MATCH_6` is a 6-cell server-authoritative mode; hidden symbol boards persist in Cadı Kazan round storage, active snapshots expose only scratched symbols, third matching reveal settles and credits 2x/5x/10x/20x/100x, six-cell no-match settles loss, and cash-out is disabled. Next: wire the card into the Cadı Kazan client/deck and render the 3×2 live scratch UI.
- 2026-09-27 — The Office server outcome engine — 10,000-roll paytable locks Kevin 2x @25%, Jim 5x @5%, Dwight 10x @1%, Stanley 20x @0.30%, Michael Scott 100x @0.05%; loss 68.65%, theoretical RTP 96%. Generator creates exactly three winning symbols or loss boards with no triple. Next: wire OFFICE_MATCH_6 into round persistence/reveal settlement.
- 2026-09-27 — The Office 6-cell match card scaffold — 3×2 board, 3-of-a-kind rule, 96% RTP target, and symbol ladder Kevin 2x / Jim 5x / Dwight 10x / Stanley 20x / Michael Scott 100x are locked in config. Outcome weights and live card wiring remain for the next parts.
- 2026-09-26 — Isolation v2 active — Cadı Kazan development stays on `feature/cadi-kazan`; preview release is ownership-scoped into `integration/replit-preview`, not a whole-branch merge.

