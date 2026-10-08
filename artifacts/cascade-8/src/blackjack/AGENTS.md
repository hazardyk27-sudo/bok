# Blackjack operating notes

> **Mandatory startup:** Read the canonical project handbook at `integration/replit-preview:AGENTS.md` once, then this file once. Keep both in conversation context. Re-read only if rules/milestones change or a real conflict requires refresh.

## Ownership
- Canonical development branch: `feature/blackjack`.
- Owned roots: `artifacts/cascade-8/src/blackjack`, `artifacts/api-server/src/blackjack`, `lib/db/src/schema/blackjack.ts`.
- Shared route mounting, shared wallet/session primitives, schema aggregation, package files, preview infrastructure and promotion machinery remain platform-owned.
- Replit remains a preview/runtime consumer on `integration/replit-preview`; normal Blackjack source development happens on `feature/blackjack` only.

## Product direction
- Single-player blackjack table with exactly five seats. The same player may occupy and play any subset of 1–5 seats simultaneously.
- Desktop visual target is the approved 16:9 premium live-casino mockup: dark green felt, dark leather rail, restrained gold trim, dealer centered behind the table, five seat arc, compact top HUD and integrated bottom betting/action console.
- Mobile will preserve the same table identity in portrait rather than becoming a generic control dashboard.
- `TABLE MIN` exists. There is no `TABLE MAX` label or configured table maximum; the natural affordability ceiling is the player's available shared wallet balance.
- Pre-deal `X2 BET` doubles the selected seat's wager and is distinct from in-round Blackjack `DOUBLE`/double-down.
- Pre-deal controls must support chip placement, last-chip undo, clearing a selected wager, and clear seat state feedback.
- Empty seats expose a clear `TAKE SEAT` / `TAP TO SIT` affordance. Occupied, selected, bet-ready and in-round states are visually distinct.
- Planned rules baseline: 6-deck shoe, ~75% cut-card reshuffle after a completed round, dealer hits soft 17, Blackjack pays 3:2, normal win 1:1, push returns stake. Split/double/insurance rules are implemented in later parts and must remain server-authoritative once backend work starts.
- The shared `shared_wallets` row and root-scoped `game_session` remain the only live wallet/session authorities; Blackjack never creates an independent spendable wallet.

## Current milestones
- 2026-10-08 — Part 1 desktop foundation complete — `index.ts` + `blackjack.css` now define the approved 16:9 visual shell as real DOM/CSS rather than a screenshot: luxury casino backdrop, centered dealer stage, discard/shoe/chip-rack props, green felt + leather/gold table, five-seat arc, active/empty seat states, dealer/player cards, Balance/Total Bet/Table Min HUD, chip tray, pre-deal PLACE BET/UNDO/X2 BET/CLEAR BET controls, and visually separated disabled in-round HIT/STAND/DOUBLE/SPLIT controls. `TABLE MAX` is absent. This is intentionally visual-only; no wallet debit, authoritative betting, dealing or round engine is wired yet. Shared `/blackjack` route mounting remains a platform-owned integration step and was not modified from the game branch.
