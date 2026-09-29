# Idle / İşletmeler ownership

This directory is the complete Idle / İşletmeler frontend ownership root.

Idle work may modify this directory, `artifacts/cascade-8/public/businesses/**`, and the Idle API root declared in `.github/game-ownership.json`.

Idle work must not modify Slot, Roulette, Cadı Kazan, Hub, or shared/platform files during a normal game update.

The Businesses route shell, route body state, CSS reset/foundation, UI, components, services and tests live here. Do not rely on Slot/Hub `styles.css` for layout or reset behavior.

An Idle commit never publishes itself to Replit; only the central one-game promotion workflow may update the Idle slice of `integration/replit-preview`.

## Isolation v2 is active
- Work only on `feature/idle` and only inside Idle-owned roots from `.github/game-ownership.json`.
- Do not merge or push the whole feature branch into `integration/replit-preview`.
- Do not touch Replit. Replit stays on `integration/replit-preview`.
- A commit only saves Idle work. Preview release is a separate central promotion that copies only Idle-owned roots.
- If a task appears to require Hub, another game, wallet/platform, shared router/build/schema files, stop and hand it to the central integration conversation.

## Milestone continuity
- At the start of a new conversation, read this file and `Current milestones` once. Keep them in context and do not re-read them for each later command unless the rules/milestones actually changed or the conversation switches category/repository.
- Add a milestone only for durable state that the next agent would otherwise have to rediscover: an important decision, completed phase, validated baseline, major root cause/blocker, or next agreed checkpoint.
- Do not log routine micro-edits, every commit, raw test output, failed experiments, or temporary observations.
- Keep the list curated and short (normally 5–10 bullets), newest first. Replace or remove superseded items instead of appending forever.
- Preferred format: `YYYY-MM-DD — Milestone — current result/state. Next: ...`
- Before a meaningful handoff/new chat, update this section if the durable state changed.
- This milestone section belongs to Idle / İşletmeler; updating it is allowed on `feature/idle` because this `AGENTS.md` is inside the category's owned root.
- If a note conflicts with code/tests/ownership rules, the validated repository state wins.

## Current milestones
- 2026-09-30 — Part 25 complete: the active Idle stack has been cut over completely from the retired passive-cash business/Vault model to canonical Stadium ticket state — `GET /api/idle/state` now assembles Stadium production, shared wallet and global ticket market only; it locks Stadium before wallet in one transaction so reads cannot mix halves of a concurrent economy mutation. The old `/idle/collect-all`, business collect, legacy business-upgrade and legacy vault-upgrade routes are removed. Frontend services now expose only Stadium seat/level/Speed/Storage/ticket-sale + market APIs and browser-side microticket projection; the Businesses route renders a single canonical Stadium/ticket snapshot with live SSE market price and no TOPLA/TÜMÜNÜ TOPLA/passive-cash/Kasa controls. Retired backend repository/policy/money/storage modules and retired frontend business-card/config/type/accrual helpers were removed; legacy SQL tables/rows remain untouched solely for migration safety. Integration/contracts were rewritten around the canonical state/action surface, including shared-wallet continuity, read lock ordering, rollback connection poisoning, retired-route 404s and live Storage projection. Next: Part 26, build the final premium main Stadium screen on top of this canonical data/action layer.
- 2026-09-29 — Final active scope — Stadium is the only active business. Club Store and Fan Club are removed from active UI/economy/API progression until a future explicit decision. The old direct passive-cash / TOPLA / TÜMÜNÜ TOPLA economy is retired.
- 2026-09-29 — Final Stadium progression — Stadium uses 10 capacity levels (1k / 5k / 10k / 20k / 35k / 50k / 75k / 100k / 150k / 500k), unlock costs Free / $5K / $15K / $50K / $150K / $500K / $1.5M / $4M / $10M / $20M, and seat prices $1 / $3 / $5 / $10 / $20 / $50 / $100 / $250 / $500 / $1,000. Above 200k, seat price rises 10% every 25k; hard max is 500k. Capacity need not be filled before the next Stadium level is unlocked.
- 2026-09-29 — Final production/storage progression — Production is strictly ownedSeats × perSeatSpeed. Speed is an independent 20-level track from 0.0020 to 0.10417 ticket/seat/hour with the accepted cost curve. Storage is an independent 20-level track from 25 to 500,000 tickets with the accepted cost curve. Neither resets on Stadium level-up.
- 2026-09-29 — Final accrual behavior — Production continues online and offline with no artificial offline-time cap, but stops whenever current Storage is full. Overflow is never discarded or auto-sold. Upgrade actions must checkpoint elapsed production under the old state before changing seats/speed/storage.
- 2026-09-29 — Final global market — One server-authoritative ticket price for every player. Initial bootstrap price $4.00, 5-second ticks, BTC 5-second percentage move ×15, no per-tick movement cap/smoothing, only $0.20 minimum and $10.00 maximum. Binance BTCUSDT WebSocket is primary, Coinbase BTC-USD is backup; failover/restart re-baselines BTC so provider gaps do not create fake ticket moves.
- 2026-09-29 — Final market persistence/sale rules — Persist authoritative current market state and only the rolling last 24 hours of raw 5-second ticket-price history (max 17,280 ticks). Player may sell any stored quantity with manual input plus 25% / 50% / 75% / MAX shortcuts. Backend execution price at request processing is authoritative; ticket decrement and shared-wallet credit are atomic and idempotent.
- 2026-09-29 — Final UI direction — Preserve the current Idle navy/blue theme and premium shell. Main screen stays compact: Stadium identity/image, ticket inventory/production/storage essentials, live price, sale action, Details, and market entry. Details owns Stadium/Speed/Storage progression; 24h graph and richer price analytics live in an expandable market panel. Design target is simple, dynamic, premium, professional, responsive, and restrained.
- 2026-09-27 — Existing visual baseline retained for redesign — Businesses route already owns its isolated CSS foundation, premium navy/blue tokens, desktop/tablet scrolling fix, mobile scroll shell, 16:9 Stadium hero treatment, and responsive route structure. Reuse the stable shell while replacing the old three-card/direct-income content.
- 2026-09-26 — Isolation v2 active — Work only on `feature/idle` and Idle-owned roots. Never merge the whole branch into `integration/replit-preview`; preview promotion remains ownership-scoped.
