# Stadium Economy — Canonical Specification

Status: **accepted for implementation**
Date: 2026-10-03
Branch: `feature/idle`

This document is the canonical economy/product specification for Idle / İşletmeler.
If an older Idle milestone, comment, test, config value, or implementation conflicts with this file, this specification wins until the user explicitly changes a rule.

## 1. Active business scope

- **Stadium is the only active business.**
- Club Store and Fan Club are removed from the active product, UI, economy, API, and progression scope for this redesign.
- They may return only after a future explicit decision.
- The old direct-cash passive-income model is retired.
- The Stadium produces **tickets**, not money.
- Tickets enter storage and are sold manually at the global live ticket price.
- Shared wallet integration remains authoritative; this redesign must never reset the shared wallet.

## 2. Stadium capacity progression

Stadium level is a **capacity gate only**. It does not directly multiply production, storage, or sale price.

| Stadium Lv | Max seat capacity | Unlock cost |
|---:|---:|---:|
| 1 | 1,000 | Free |
| 2 | 5,000 | $5,000 |
| 3 | 10,000 | $15,000 |
| 4 | 20,000 | $50,000 |
| 5 | 35,000 | $150,000 |
| 6 | 50,000 | $500,000 |
| 7 | 75,000 | $1,500,000 |
| 8 | 100,000 | $4,000,000 |
| 9 | 150,000 | $10,000,000 |
| 10 | 500,000 | $20,000,000 |

Rules:

- Stadium Lv1 is available for free.
- The game starts with **1,000 owned seats** at Lv1; those initial seats are free.
- The player may buy any positive quantity that fits the currently unlocked capacity and available wallet balance.
- Filling the current capacity is **not required** before unlocking the next Stadium level.
- Stadium level, Speed level, and Storage level are independent progression tracks.
- Stadium level-up never resets Speed or Storage.

### Seat-price bands

The seat price is determined by the seat-count band being purchased, not merely by the highest Stadium level already unlocked.

| Seat positions being added | Unit price |
|---:|---:|
| 0–49,999 | $3 |
| 50,000–149,999 | $5 |
| 150,000–249,999 | $10 |
| 250,000–349,999 | $20 |
| 350,000–449,999 | $30 |
| 450,000–499,999 | $50 |

A bulk purchase that crosses price bands must be priced band-by-band on the server.

Reference totals from the free 1,000-seat starting state:

- 1,000 → 50,000 seats costs **$147,000**.
- 1,000 → 500,000 seats costs **$9,147,000** in seat purchases.

## 3. Maximum capacity and seat-pricing boundaries

- The absolute maximum Stadium capacity is **500,000 seats**.
- There is no percentage-growth formula after 200,000 seats.
- There is no 25,000-seat +10% price step anymore.
- The fixed seat-price bands in section 2 are authoritative all the way to 500,000 seats.
- The server must split a bulk purchase at every price boundary so one request cannot bypass a price step.

## 4. Ticket production speed

Production is strictly linear:

```text
ticketsPerHour = ownedSeats × currentPerSeatSpeed
```

There are no hidden multipliers or diminishing returns.

| Speed Lv | Ticket / seat / hour | Upgrade cost |
|---:|---:|---:|
| 1 | 0.0020 | Start |
| 2 | 0.0025 | $1,000 |
| 3 | 0.0030 | $2,500 |
| 4 | 0.0037 | $5,000 |
| 5 | 0.0046 | $10,000 |
| 6 | 0.0057 | $20,000 |
| 7 | 0.0070 | $40,000 |
| 8 | 0.0086 | $75,000 |
| 9 | 0.0105 | $125,000 |
| 10 | 0.0130 | $200,000 |
| 11 | 0.0160 | $350,000 |
| 12 | 0.0197 | $600,000 |
| 13 | 0.0243 | $1,000,000 |
| 14 | 0.0299 | $1,600,000 |
| 15 | 0.0368 | $2,500,000 |
| 16 | 0.0453 | $4,000,000 |
| 17 | 0.0558 | $6,000,000 |
| 18 | 0.0687 | $9,000,000 |
| 19 | 0.0846 | $13,000,000 |
| 20 | 0.10417 | $30,000,000 |

Reference points:

- 1,000 seats at Speed Lv1 = **2 tickets/hour**.
- 200,000 seats at Speed Lv20 ≈ **20,833 tickets/hour**.

Speed is independent of Stadium level.

## 5. Ticket storage

Storage is a separate 20-level progression and never resets.

| Storage Lv | Capacity (tickets) | Upgrade cost |
|---:|---:|---:|
| 1 | 25 | Start |
| 2 | 50 | $500 |
| 3 | 100 | $1,000 |
| 4 | 200 | $2,000 |
| 5 | 400 | $4,000 |
| 6 | 750 | $7,500 |
| 7 | 1,250 | $15,000 |
| 8 | 2,000 | $30,000 |
| 9 | 3,500 | $60,000 |
| 10 | 6,000 | $100,000 |
| 11 | 10,000 | $175,000 |
| 12 | 17,000 | $300,000 |
| 13 | 28,000 | $500,000 |
| 14 | 45,000 | $800,000 |
| 15 | 70,000 | $1,200,000 |
| 16 | 105,000 | $1,800,000 |
| 17 | 155,000 | $2,600,000 |
| 18 | 230,000 | $3,800,000 |
| 19 | 340,000 | $5,200,000 |
| 20 | 500,000 | $10,000,000 |

Storage-full behavior:

- Production stops immediately when storage reaches its current capacity.
- Overflow tickets are not created, discarded, or auto-sold.
- Production resumes automatically after the player sells tickets and frees space.

## 6. Offline production

- Ticket production continues while the player is offline.
- There is **no artificial offline-time limit**.
- If the player is away for 10 days, the full elapsed period may be considered.
- Production can only accrue until current Storage capacity is full.
- Once full, production remains stopped for the rest of the offline period.
- Upgrade actions must checkpoint production at the old seat/speed/storage state before applying the upgrade, so a new upgrade can never retroactively increase past production.

## 7. Global BTC-driven ticket market

The ticket market is global: all players see the same authoritative price.

Initial bootstrap price when no persisted market state exists:

```text
$7.00
```

Market tick:

- Sample interval: **5 seconds**.
- Underlying signal: BTC percentage movement over the same 5-second interval.
- Sensitivity: **20x**.
- No per-tick rise/fall cap.
- No smoothing cap.
- The only ticket-price limits are:
  - minimum **$0.10**
  - maximum **$20.00**

Formula:

```text
btcReturn = newBTC / previousBTC - 1
rawTicketPrice = currentTicketPrice × (1 + 20 × btcReturn)
ticketPrice = clamp(rawTicketPrice, $0.10, $20.00)
```

Example:

```text
BTC +0.10% in one 5-second interval
→ ticket raw move +2%
→ $7.00 becomes $7.14 before any clamp
```

BTC movement is otherwise followed without an additional movement limit.

## 8. BTC market-data sources and resilience

Server-side only:

- **Primary:** Binance BTCUSDT public WebSocket.
- **Backup:** Coinbase BTC-USD public WebSocket.
- Clients never connect directly to an exchange and never submit authoritative BTC/ticket prices.
- Backend keeps the latest valid BTC observation and samples it every 5 seconds.
- Implement reconnect/resubscribe and stale-feed detection.
- Handle planned/forced provider reconnects, including Binance connection rotation.
- On provider switch, take a new BTC baseline first; exchange-to-exchange nominal price differences must never create a fake ticket-price move.
- If both feeds are unavailable, freeze the last valid ticket price.
- When a feed returns, re-baseline BTC and apply only subsequent percentage movements.
- On server restart, restore the persisted ticket market state instead of resetting to $7.00, then re-baseline BTC before continuing.

## 9. Market SQL retention

Persist server-authoritative market state and a rolling **24-hour** price history.

At a 5-second cadence:

```text
24h × 60 × 60 / 5 = 17,280 raw ticks maximum
```

Rules:

- Keep the authoritative current/last ticket market state.
- Keep only the most recent 24 hours of raw ticket-price ticks.
- Delete older raw rows automatically on a rolling basis.
- Market UI may derive shorter windows (for example 1h and 6h) from this same 24-hour dataset.
- The table must not grow without bound.

## 10. Ticket selling

The player chooses how many currently stored tickets to sell.

Controls:

- manual quantity
- 25%
- 50%
- 75%
- MAX

Settlement rules:

- The price shown in the client is informational.
- The authoritative execution price is the **global server ticket price when the backend receives/processes the sell request**.
- Client-submitted price is never trusted.
- Ticket removal and shared-wallet credit happen in one atomic backend transaction.
- If either side fails, the entire sale rolls back.
- Selling cannot create negative inventory.
- Retry/double-click behavior must be idempotent.

## 11. Main-screen information hierarchy

Keep the existing Idle visual palette/theme, but redesign the page as a single premium Stadium operation surface.

Main screen should remain intentionally compact and prioritize:

- Stadium identity/image
- current stored ticket inventory
- current ticket production rate
- storage fill/status
- live ticket price
- ticket sale controls/action
- **DETAYLAR**
- entry point for expanded market information

Do **not** permanently show every progression table or the full 24-hour chart on the main screen.

## 12. Details panel

The existing Details interaction remains the progression entry point.

It must contain three independent systems:

1. **Stadium**
   - current Stadium level
   - owned seats
   - current capacity
   - next capacity/unlock cost
   - seat purchase
   - current seat-price band and next price boundary
   - 500k hard maximum

2. **Production Speed**
   - current Speed level
   - current per-seat speed
   - current total tickets/hour
   - next speed and upgrade cost

3. **Storage**
   - current Storage level
   - current capacity
   - current stored tickets/fill
   - next capacity and upgrade cost

## 13. Market panel

The live ticket price remains visible on the main Stadium screen.

Expanded/openable market panel should contain:

- live ticket price
- recent percentage change
- rolling price chart
- selectable shorter views such as 1h / 6h / 24h when implemented
- 24-hour high/low when practical

The chart/history belongs in this panel, not permanently on the main page.

## 14. Visual direction

Keep the existing Idle navy/blue palette and overall identity.

Target:

- simple at first glance
- premium
- dynamic
- professional
- clear typography hierarchy
- generous controlled spacing
- restrained depth
- smooth state transitions
- polished micro-interactions
- subtle live-price movement feedback
- clear production/full-storage states
- strong mobile readability

Avoid:

- casino-flashy presentation
- excessive glow
- excessive gradients
- dense dashboard clutter
- showing all numbers simultaneously
- decorative animation that competes with gameplay decisions

## 15. Retired legacy behavior

The implementation must remove or migrate away from these old active concepts:

- three simultaneously active businesses
- direct passive cash generation
- accrued-cash collection
- TOPLA
- TÜMÜNÜ TOPLA
- old six-level hour-based Kasa
- Kasa reset on business level-up
- old 9-stage business-income ladders
- old aggregate 27-level business progression

They must not remain as hidden economy paths after the new system becomes authoritative.
