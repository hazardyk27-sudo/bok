# Blackjack owned-area instructions

This directory is the frontend ownership root for the Blackjack game.

## Branch and ownership
- Work only on `feature/blackjack`.
- Frontend-owned root: `artifacts/cascade-8/src/blackjack`.
- Backend-owned root: `artifacts/api-server/src/blackjack`.
- Blackjack DB schema root: `lib/db/src/schema/blackjack.ts`.
- Do not edit shared router, wallet/session, workspace config, package/lock files, or another game's files from normal Blackjack work.
- Shared wiring must be handled by the central integration flow.

## Architecture invariants
- The server is authoritative for cards, shoe order, bets, turn order, outcomes and settlement.
- One table has 5 fixed player seats plus one dealer.
- The shared shoe uses 6 decks (312 cards).
- Target penetration is about 75%; crossing the cut threshold marks reshuffle-after-round. Never reshuffle mid-round.
- If the remaining shoe is unsafe for a new round, reshuffle before that round starts.
- Client animation is presentation only and never advances authoritative state.
- Double means exactly: double the current wager, receive exactly one additional card, then automatic stand.
- High-value chip denominations continue by doubling after 1K: 2K, 4K, 8K, 16K, and so on.

## Current milestones
- 2026-09-27 — Part 2 domain model complete — authoritative card/shoe/seat/player/hand/round/table/bet/ledger types are isolated under the Blackjack backend root; physical duplicate cards have unique IDs and split hands have independent IDs/bets. Ownership guard PASS at `f1abb68f4d0ba1d82311763b0800221c3b9a2cfd`. Next: Part 3 pure Rule Engine.
- 2026-09-27 — Part 1 isolated foundation validated — `feature/blackjack` now contains the owned 5-seat frontend shell, smoke contract and `/api/blackjack` namespace; ownership guard passes at `76f72a8176d2c83aa47d142658f3b34e9b0662d4`. Shared `/blackjack` router wiring still requires the central preview promotion/wiring step. Next: complete that central wiring, then close Part 1 and move to Part 2 domain model.
