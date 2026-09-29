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
- 2026-09-29 — Stadium progression v2 agreed — Stadium has 10 capacity levels ending at 200,000 seats; seat output remains tied to a separately upgraded production-speed track with 16 levels; storage is a separate 16-level track and never resets on stadium level-up. Max storage must equal exactly 24 hours of ticket production at max stadium capacity and max speed. No level bonuses; stadium level only unlocks more seat capacity and raises the price of newly purchased seats.
- 2026-09-29 — Granular stadium progression approved — Stadium upgrades are capacity-gated, not bonus-gated. Every seat always produces 0.1 ticket/hour; the seat purchase price rises by stadium level (Lv1: $1/seat, Lv2: $2/seat, etc.) to control runaway production. Players advance levels only to unlock a higher maximum stadium seat capacity. Product storage is upgraded independently in direct capacity purchases (for example 1,000 → 2,000 capacity for a cash cost) rather than using discrete vault levels. No level-based production, storage, or commission bonuses.
- 2026-09-29 — İşletmeler economy redesign approved — Businesses will produce inventory/products instead of direct cash; products are sold manually at the current server-authoritative dynamic market price. Prices fluctuate algorithmically over time, storage capacity creates a timing tradeoff, and sale value is product quantity × current market price. First example: Stadium produces tickets. Next: redesign granular upgrade/progression economics around production capacity.
- 2026-09-27 — Slate Blue Parts 1–24 complete — Desktop and tablet Businesses pages scroll vertically again: route/root viewport clipping is overridden from 761px upward, and workspace/page heights are content-driven instead of capped to the viewport. Mobile scrolling behavior remains unchanged. Next: visually QA in Replit preview.
- 2026-09-27 — Slate Blue Parts 1–23 complete — On mobile, `BİRİKMİŞ GELİR` and its amount now share the same left content line as the `SAATLİK GELİR` stat values, matching the desktop alignment. Next: visually QA in Replit preview.
- 2026-09-27 — Slate Blue Parts 1–22 complete — Desktop business cards now use an exact 16:9 hero, equal-height natural rows (without viewport-fill stretching), and responsive no-wrap typography so vault/helper/value text stays on one line across the three cards. Next: visually QA in Replit preview.
- 2026-09-27 — Slate Blue Parts 1–21 complete — `TÜMÜNÜ TOPLA` now uses the same primary-action color, typography, radius, height, disabled state and hover treatment as each card's `TOPLA` button; its extra eyebrow and arrow are hidden so the two controls read as one system. Next: visually QA and promote to `integration/replit-preview` when approved.
- 2026-09-26 — Isolation v2 active — Idle / İşletmeler development stays on `feature/idle`; preview release is ownership-scoped into `integration/replit-preview`, not a whole-branch merge.
