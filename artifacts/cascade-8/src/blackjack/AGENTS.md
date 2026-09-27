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
- 2026-09-27 — Part 1 foundation started — isolated Blackjack frontend/API roots created on `feature/blackjack`; no game logic, wallet mutation, shared route wiring, or multiplayer transport is allowed in this part. Next: complete the isolated skeleton validation, then move to Part 2 domain model.
