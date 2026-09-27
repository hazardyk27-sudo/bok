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
- 2026-09-27 — Part 9 canonical five-seat foundation complete — server table invariant requires exactly seats 1–5, rejects missing/duplicate/invalid seat numbers and duplicate player occupancy, and creates an immutable five-empty-seat `TABLE_IDLE` foundation. Dedicated Blackjack regression PASS in preview run `36333828850`. Next: Part 10 join/seat/leave and next-round waiting behavior.
- 2026-09-27 — Part 8 table state machine complete — table operational phases are separated from round phases; canonical normal transitions, shuffle branches, initial-deal shortcut, explicit recovery entry/restore and monotonic `stateVersion` are enforced, while illegal jumps/backwards/same-phase transitions are rejected. Dedicated Blackjack regression PASS in preview run `36333672700`. Next: Part 9 canonical five-seat table foundation.
- 2026-09-27 — Gate 1 SHOE PASS — dedicated Blackjack regression in preview run `36333390610` passed with the full domain/rules/shoe/shuffle/draw/lifecycle suite plus a 1,000-shoe secure-shuffle integrity stress: every shoe is exactly 312 cards, composition-valid and contains 312 unique physical card IDs. Global preview remains independently red on the pre-existing Idle integration regression. Next: Part 8 table state machine.
- 2026-09-27 — Part 7 cut-card lifecycle complete — target penetration is 75% (234/312); reaching the threshold after a round only marks `reshufflePending`, while fresh-shoe replacement is restricted to the before-round boundary and can also be forced by a caller-supplied minimum-card safety floor. Dedicated Blackjack regression PASS in preview run `36333290330`. Next: Gate 1 thousand-shoe integrity stress.
- 2026-09-27 — Part 6 authoritative shoe cursor complete — `drawNextBlackjackCard` is the single-card cursor API, advances exactly one index without mutating the source shoe, consumes the locked 312-card order without skips/duplicates and throws on exhaustion/corrupted cursors. Dedicated Blackjack regression PASS in preview run `36333062951`. Next: Part 7 75% cut-card and round-boundary reshuffle policy.
- 2026-09-27 — Part 5 secure shuffle complete — production shuffle uses server-side Node `crypto.randomInt` with Fisher–Yates, preserves exact shoe composition, does not mutate the source order and freezes the shuffled order/metadata. Dedicated Blackjack regression PASS in preview run `36332936322`. Next: Part 6 authoritative shoe cursor and single-card draw API.
- 2026-09-27 — Part 4 six-deck shoe construction complete — ordered shoe creation produces exactly 312 physical cards, 52 per deck, six copies of every suit/rank face and 312 unique `cardId`s; composition corruption is rejected. Dedicated Blackjack regression PASS in preview run `36332778703`. Next: Part 5 CSPRNG secure shuffle.
- 2026-09-27 — Part 3 Rule Engine complete — V1 pure rules cover Ace/soft-hand evaluation, natural Blackjack, S17, Hit/Stand eligibility, Double/DAS, Split limits/Ace restrictions, result resolution and exact 3:2 settlement math. Preview CI typecheck/build and dedicated Blackjack backend regression PASS in run `36332318586`; the overall preview run remains red only on the pre-existing Idle integration regression. Next: Part 4 six-deck shoe construction.
- 2026-09-27 — Part 2 domain model complete — authoritative card/shoe/seat/player/hand/round/table/bet/ledger types are isolated under the Blackjack backend root; physical duplicate cards have unique IDs and split hands have independent IDs/bets. Ownership guard PASS at `f1abb68f4d0ba1d82311763b0800221c3b9a2cfd`. Next: Part 3 pure Rule Engine.
- 2026-09-27 — Part 1 isolated foundation validated — `feature/blackjack` now contains the owned 5-seat frontend shell, smoke contract and `/api/blackjack` namespace; ownership guard passes at `76f72a8176d2c83aa47d142658f3b34e9b0662d4`. Shared `/blackjack` router wiring still requires the central preview promotion/wiring step. Next: complete that central wiring, then close Part 1 and move to Part 2 domain model.
