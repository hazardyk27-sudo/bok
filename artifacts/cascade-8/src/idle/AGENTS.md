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
- 2026-09-29 — Post-200k seat pricing accepted — After Stadium Lv10 unlocks the post-200k range, the seat unit price starts at $1,000 and increases by 10% for every additional 25,000-seat block above 200,000. Formula: price = 1000 × 1.10^floor((seats - 200000) / 25000). Stadium capacity is no longer unlimited: the hard maximum is 500,000 seats. Pricing is stepwise by 25k block.
- 2026-09-29 — Stadium unlock costs accepted — Stadium remains a 10-level capacity track: 1k / 5k / 10k / 20k / 35k / 50k / 75k / 100k / 150k / 200k+. Seat prices per tier are $1 / $3 / $5 / $10 / $20 / $50 / $100 / $250 / $500 / $1,000. Accepted level-unlock costs for Lv2–10 are $5K / $15K / $50K / $150K / $500K / $1.5M / $4M / $10M / $20M. Lv10 unlocks 200,000+ unlimited seat growth. Next: finalize the post-200k seat price growth rule, then the dynamic ticket-market algorithm.
- 2026-09-29 — Stadium capacity progression reverted to 10 levels — Capacity tiers are 1,000 / 5,000 / 10,000 / 20,000 / 35,000 / 50,000 / 75,000 / 100,000 / 150,000 / 200,000+. Seat prices by tier remain $1 / $3 / $5 / $10 / $20 / $50 / $100 / $250 / $500 / $1,000. Lv10 unlocks unlimited post-200k seat growth and has a fixed stadium-level unlock cost of $20,000,000. Earlier 20-level stadium-capacity proposal is superseded; speed and storage remain separate 20-level systems.
- 2026-09-29 — Ticket storage progression accepted — Storage is an independent 20-level track that never resets on stadium level-up. Capacity progression is 25, 50, 100, 200, 400, 750, 1,250, 2,000, 3,500, 6,000, 10,000, 17,000, 28,000, 45,000, 70,000, 105,000, 155,000, 230,000, 340,000, 500,000 tickets. Upgrade costs are $500, $1K, $2K, $4K, $7.5K, $15K, $30K, $60K, $100K, $175K, $300K, $500K, $800K, $1.2M, $1.8M, $2.6M, $3.8M, $5.2M, $10M for Lv2–20. Next: finalize the remaining market, stadium-level unlock-cost, and post-200k seat-pricing rules before implementation.
- 2026-09-29 — Ticket speed progression accepted — Production speed uses 20 independent levels. Lv1 starts at 0.002 ticket/seat/hour (2 tickets/hour at 1,000 seats) and Lv20 reaches 0.10417 ticket/seat/hour (≈20,833 tickets/hour at 200,000 seats). Accepted upgrade-cost curve: Lv2 $1K, Lv3 $2.5K, Lv4 $5K, Lv5 $10K, Lv6 $20K, Lv7 $40K, Lv8 $75K, Lv9 $125K, Lv10 $200K, Lv11 $350K, Lv12 $600K, Lv13 $1M, Lv14 $1.6M, Lv15 $2.5M, Lv16 $4M, Lv17 $6M, Lv18 $9M, Lv19 $13M, Lv20 $30M. Next: finalize the 20-level storage-capacity/cost curve up to 500,000 tickets.
- 2026-09-29 — Stadium progression v4 agreed — Stadium keeps finite capacity tiers up to the final `200,000+` tier; once the final stadium tier is unlocked, players may continue buying seats without a hard seat cap, so post-200k seat pricing must scale upward continuously. Ticket production is strictly linear per seat: total hourly tickets = owned seats × current per-seat production speed. Speed is a separate 20-level track and must start very low to prevent early runaway income; its max target is calibrated so 200,000 seats at Speed Lv20 produce 500,000 tickets in 24 hours (≈0.1041667 ticket/seat/hour, ≈20,833 tickets/hour). Storage is a separate 20-level track capped at 500,000 tickets and never resets on stadium level-up. Above 200,000 seats, even max storage represents less than 24 hours, intentionally increasing endgame sell/management pressure.
- 2026-09-29 — Granular stadium progression approved — Stadium upgrades are capacity-gated, not bonus-gated. Every seat always produces 0.1 ticket/hour; the seat purchase price rises by stadium level (Lv1: $1/seat, Lv2: $2/seat, etc.) to control runaway production. Players advance levels only to unlock a higher maximum stadium seat capacity. Product storage is upgraded independently in direct capacity purchases (for example 1,000 → 2,000 capacity for a cash cost) rather than using discrete vault levels. No level-based production, storage, or commission bonuses.
- 2026-09-29 — İşletmeler economy redesign approved — Businesses will produce inventory/products instead of direct cash; products are sold manually at the current server-authoritative dynamic market price. Prices fluctuate algorithmically over time, storage capacity creates a timing tradeoff, and sale value is product quantity × current market price. First example: Stadium produces tickets. Next: redesign granular upgrade/progression economics around production capacity.
- 2026-09-27 — Slate Blue Parts 1–24 complete — Desktop and tablet Businesses pages scroll vertically again: route/root viewport clipping is overridden from 761px upward, and workspace/page heights are content-driven instead of capped to the viewport. Mobile scrolling behavior remains unchanged. Next: visually QA in Replit preview.
- 2026-09-27 — Slate Blue Parts 1–23 complete — On mobile, `BİRİKMİŞ GELİR` and its amount now share the same left content line as the `SAATLİK GELİR` stat values, matching the desktop alignment. Next: visually QA in Replit preview.
- 2026-09-27 — Slate Blue Parts 1–22 complete — Desktop business cards now use an exact 16:9 hero, equal-height natural rows (without viewport-fill stretching), and responsive no-wrap typography so vault/helper/value text stays on one line across the three cards. Next: visually QA in Replit preview.
- 2026-09-27 — Slate Blue Parts 1–21 complete — `TÜMÜNÜ TOPLA` now uses the same primary-action color, typography, radius, height, disabled state and hover treatment as each card's `TOPLA` button; its extra eyebrow and arrow are hidden so the two controls read as one system. Next: visually QA and promote to `integration/replit-preview` when approved.
- 2026-09-26 — Isolation v2 active — Idle / İşletmeler development stays on `feature/idle`; preview release is ownership-scoped into `integration/replit-preview`, not a whole-branch merge.
