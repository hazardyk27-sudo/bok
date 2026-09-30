# Hub / Main Menu agent instructions

> **Mandatory startup:** First read the canonical project handbook at `integration/replit-preview:AGENTS.md`. Then read this file. These are the only two mandatory instruction files for a normal Hub conversation. The canonical root handbook owns all shared GitHub/Replit/Supabase/wallet/promotion/Shell rules.

## Purpose
Hub is the main OYUN game-selector / lounge experience mounted at `/`. It is presentation/navigation only; it must not become a wallet, game-engine, auth, or API authority.

Current menu presents the live product worlds:
- Slot / Cascade 8 -> `/slot`
- Roulette -> `/roulette`
- Cadı Kazan -> `/cadi-kazan`
- İşletmeler -> `/businesses`

The Hub currently communicates that the product uses virtual credits only and is not real-money gambling.

## Branch and ownership
- Canonical branch: `feature/hub`
- Owned root: `artifacts/cascade-8/src/hub`
- Main implementation: `artifacts/cascade-8/src/hub/index.ts`
- Main regression: `artifacts/cascade-8/src/hub/mainMenuRegression.test.ts`

Hub work may change Hub-owned markup, styles/components inside its owned root, copy, cards, navigation targets, responsive menu behavior, and Hub-owned tests.

Hub work must not directly modify:
- another game's files;
- shared `src/main.ts` route dispatcher;
- shared `src/styles.css` unless central integration explicitly owns the change;
- wallet/session/auth/API platform files;
- workspace/build/Replit/promotion infrastructure.

If a new game needs a shared route mount or shared shell change, Hub can prepare its owned card/UI, but the shared wiring belongs to central integration.

## Product/UI invariants
- Keep the main selector simple, premium, readable, and navigation-first.
- Game cards must link to real supported routes; do not create dead placeholder routes unless the user explicitly asks for a coming-soon card.
- Do not duplicate game logic or game state in Hub.
- Do not create a second wallet/balance authority in Hub.
- Preserve accessibility labels and keyboard/link semantics when redesigning cards.
- The Hub can visually represent game availability, but the game's own AGENTS/code remain authoritative for its rules/status.

## Validation
Before commit, run the Hub-owned regression surface and verify changed files stay inside the Hub ownership root.

## Current milestones
- 2026-09-30 — Hub instruction scope standardized — canonical project rules moved to `integration/replit-preview:AGENTS.md`; this file now contains only Hub purpose, ownership, UI/navigation invariants and Hub milestones. Current menu has four live cards: Slot, Roulette, Cadı Kazan and İşletmeler.
- 2026-09-26 — Isolation v2 active — Hub development stays on `feature/hub`; preview release is ownership-scoped into `integration/replit-preview`, not a whole-branch merge.
