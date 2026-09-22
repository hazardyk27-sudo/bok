# OYUN — PROJECT CONTINUITY MEMORY

**Last updated:** 2026-09-23  
**Canonical GitHub repo:** `hazardyk27-sudo/bok`  
**Canonical branch:** `main`  
**Replit app:** `Cascade 8 Slot Game`  
**Repl ID:** `799f53e3-6d51-4a21-909c-3a4f5e94c6ea`

---

## 0) NEW CHAT BOOTSTRAP — READ THIS FIRST

This file exists so a new ChatGPT conversation can continue the OYUN project without reconstructing the whole history.

### Continuation command

If the user writes:

`OYUN-CONTINUE`

the assistant should:

1. Open and read this file from GitHub first.
2. Inspect the latest `main` branch and the latest relevant commits/files before making technical claims.
3. Continue from **CURRENT NEXT TASK** below unless the user asks for something else.
4. Do not make the user repeat old decisions that are already written here.
5. When a meaningful decision or implementation milestone is approved, update this file so it remains the continuity source.

Older alias that may still appear:
`CASCADE8-CONTINUE-2026-09-17`

### Source-of-truth rule

There are two kinds of truth in this project:

- **Product intent / approved design decisions:** this file records what the user wants.
- **What is actually running right now:** current GitHub code + runtime/tests are authoritative.

If they conflict, **do not silently choose one**. Report the mismatch. For “what is running?” trust code/runtime. For “what should we build?” follow the latest approved product decision.

Do not assume old `README.md` math is current. It contains historical material and can lag behind the actual game configuration.

---

# 1) HOW WE WORK

This workflow is an explicit user preference and should be preserved across chats.

## A. When the user says “inspect / audit / check / find the bug”

**ChatGPT performs the inspection itself.**

Use GitHub/code/runtime evidence directly. Do **not** delegate the audit to Replit Agent.

Examples:
- inspect Roulette
- find physics problems
- check payout logic
- compare mobile layout
- inspect tests
- find where RTP is wrong

Replit must not be asked to “audit itself” unless the user explicitly asks for a second independent Replit opinion.

## B. When the user says “change / fix / implement”

Preferred path:

1. ChatGPT inspects the relevant GitHub files.
2. ChatGPT writes the code change in GitHub directly.
3. Commit the change.
4. Replit is used only to sync the new GitHub state and run Preview.
5. User checks the result visually in Replit Preview.
6. If rejected, revise/revert with another GitHub commit.

**Replit Agent is not the primary code author in this workflow.**

## C. GitHub → Replit sync-only rule

After ChatGPT changes `main`, Replit may be instructed only to synchronize the workspace.

Safe sync logic:

- verify working tree is clean
- verify active branch is `main`
- verify remote is `github`
- fetch `github/main`
- fast-forward only to `github/main`

Conceptually:

`git fetch github main`  
`git merge --ff-only github/main`

If any of these fail, Replit must stop and report.

Do **not** automatically use:
- rebase
- merge conflict resolution
- `reset --hard`
- stash
- clean
- force checkout
- force push

The user normally should not need to click anything. Ask for manual intervention only when auth/branch/conflict state genuinely requires it.

## D. Git history status

The real Replit project was pushed to GitHub through a temporary branch named `replit-upload`, then GitHub `main` was moved to the same project commit.

**Canonical branch from now on: `main`.**  
`replit-upload` is historical/transport only and should not be treated as the development branch.

---

# 2) SYSTEM OVERVIEW

OYUN is one browser game suite. The currently important playable areas are:

1. **Cascade 8 Slot**
2. **Roulette**
3. **Cadı Kazan** (scratch card)

They are not separate wallet products. They are part of the same game economy.

## Main code layout

### Frontend / game client
`artifacts/cascade-8/`

Important files:
- `src/main.ts`
- `src/styles.css`
- `src/rouletteClient.ts`
- `src/roulette.css`
- `src/rouletteGeometry.ts`
- `src/roulettePhysicsReplay.ts`
- `src/witchClient.ts`
- `src/witch.css`
- `src/scratch/`
- `src/config/GameConfig.ts`
- `src/engine/`
- `src/game/`
- `src/simulation/`

### API / server authority
`artifacts/api-server/`

Important areas:
- `src/roulette/`
- `src/physics-lab/`
- `src/slot/`
- `src/cadi-kazan/`

### Persistence
PostgreSQL through the workspace DB package.

## Shared wallet

Slot, Roulette and Cadı Kazan use the same server-side wallet/session economy.

The common wallet table is based on `roulette_wallets`.

Important principle:

> The browser may display game state, but money-impacting results, RNG settlement and final balance changes must be server authoritative.

The wallet is virtual/demo-credit only. Do not add deposits, withdrawals, payment processors or real-money cashout infrastructure unless the user explicitly changes the product scope.

---

# 3) CASCADE 8 SLOT — CURRENT MODEL

## Core game

- Board: **6 columns × 5 rows**
- Anywhere-pays / cluster-by-count style
- **8+ copies of the same normal symbol** win
- Winning symbols disappear together
- New symbols refill and can create tumbles
- Free Spins exist
- Multiplier Core system exists
- Slot outcome and wallet settlement are server-authoritative in the current architecture

## Current team symbols and frame identity

| ID | Team | Main visual color |
|---|---|---|
| S1 | Real Madrid | Magenta `#D946EF` |
| S2 | Barcelona | Purple `#B36BEF` visual identity |
| S3 | Chelsea | Royal blue `#034694` |
| S4 | Roma | Burgundy `#8E1537` |
| S5 | Liverpool | Red `#C8102E` |
| S6 | PSG | Navy `#172C62` |
| S7 | Bayern | Red `#DC052D` |
| S9 | Beşiktaş | White `#F5F5F5` |
| S8 | Galatasaray | Gold `#FFD31C` |

Use starless club logos where relevant. Logos must remain readable and fit cleanly inside premium circular frames; the frame should not dominate the logo.

## Current symbol weights in code

From `GameConfig.ts`:

| Team | Weight |
|---|---:|
| Real Madrid | 15.5 |
| Liverpool | 14.0 |
| Bayern | 13.5 |
| PSG | 12.5 |
| Roma | 11.5 |
| Barcelona | 10.5 |
| Chelsea | 10.0 |
| Beşiktaş | 7.5 |
| Galatasaray | 5.0 |

Scatter is handled separately through contextual special-symbol probabilities.

Historical weight proposals from older chats should **not** overwrite these values automatically.

## Current paytable in code

Multipliers are by count: **8 / 9 / 10 / 11 / 12+**

| Team | 8 | 9 | 10 | 11 | 12+ |
|---|---:|---:|---:|---:|---:|
| Real Madrid | 0.30x | 0.35x | 0.40x | 0.45x | 1.00x |
| Liverpool | 0.35x | 0.40x | 0.45x | 0.55x | 1.25x |
| Bayern | 0.50x | 0.55x | 0.65x | 1.00x | 1.50x |
| PSG | 0.60x | 0.65x | 0.75x | 1.10x | 1.75x |
| Roma | 0.75x | 0.85x | 1.00x | 1.25x | 1.90x |
| Barcelona | 1.00x | 1.10x | 1.30x | 1.75x | 2.40x |
| Chelsea | 1.75x | 2.10x | 2.60x | 3.50x | 5.00x |
| Beşiktaş | 3.00x | 4.50x | 5.50x | 7.50x | 10.50x |
| Galatasaray | 6.00x | 6.50x | 8.00x | 11.00x | 15.00x |

## Current pair / packet behavior

Current code:
- `NORMAL_PAIR_COPY_CHANCE = 0.75`
- `NORMAL_THIRD_REPEAT_WEIGHT_FACTOR = 0.5`

Important: older conversations mentioned 90%/96% pair-copy targets. Those are **historical**, not the current code setting.

The intended feel is frequent two-cell repetition without allowing uncontrolled 3/4/5 vertical same-symbol stacking.

## Special-symbol probabilities in current code

### Base game
- Initial Scatter: **3.25%**
- Refill Scatter: **4.0%**
- Initial Core: **0.20%**
- Refill Core: **0.70%**

### Free Spins
- Initial Scatter: **2.50%**
- Refill Scatter: **3.50%**
- Initial Core: **3.50%**
- Refill Core: **5.50%**

These values are per-context code probabilities and must be evaluated through full-spin simulation, not by eyeballing probability alone.

## Free Spin trigger rules in current config

Base:
- 4 Scatter → **10 FS**
- 5 Scatter → **15 FS**
- 6 Scatter → **20 FS**
- 7 Scatter → **25 FS**

Retrigger mapping currently:
- 3 → +5
- 4 → +5
- 5 → +5
- 6 → +5

## Multiplier Core behavior

A winning Free Spin tumble can contain multiple Core multipliers.

Cores collected during that tumble are combined and applied to that tumble’s win according to the existing engine rules.

Maximum active Free Spin Cores per Free Spin:
**7**

### Base Core value weights

- 2x: 52
- 3x: 26
- 5x: 12
- 10x: 5
- 15x: 2
- 20x: 1.2
- 25x: 0.8
- 50x: 0.5
- 100x: 0.3
- 250x: 0.12
- 500x: 0.05
- 1000x: 0.03

### Free Spin Core value weights

- 2x: 40
- 3x: 25
- 5x: 15
- 10x: 8
- 15x: 4
- 20x: 3
- 25x: 2
- 50x: 1.5
- 100x: 1
- 250x: 0.3
- 500x: 0.15
- 1000x: 0.05

## Multiplier character art mapping

- 2x — Maguire
- 3x — Erman Yaşar
- 5x — Ribéry
- 10x — Arda
- 15x — De Bruyne
- 20x — Hazard
- 25x — Kaká
- 50x — Ronaldo Nazário
- 100x — Ibrahimović
- 250x — Ronaldinho
- 500x — Cristiano Ronaldo
- 1000x — Totti

## Current max win

Current code:
**10,000x**

Do not revert to the older 5,000x value without an explicit decision.

## Slot UX decisions that must be preserved

Mobile:
- Free Spin count should not waste the top bar; keep it close to the tumble/game area.
- Auto section should be compact.
- No “Auto Ready 25” wording.
- Auto choices: 10 / 25 / 50 / 100 with large touch targets.
- When Auto is active show Stop Auto.
- Remaining Auto spins should be large and readable.
- Bet / Spin should occupy the compact bottom control area cleanly.
- Keep the 6×5 board fully visible in normal and FS states.
- Use an icon / SFX instead of verbose “Sound on”.
- Avoid decorative boxes that reduce playable area.

Normal Spin:
- X/Core can appear, but rarely.
- Tumble win display should be simple.
- Big/Mega/Max Win treatment is primarily for FS presentation, not normal-spin clutter.

Free Spins:
- dedicated start ceremony
- retrigger +5 animation
- multiple X/Core in one tumble can occur
- Cores animate into the multiplier collection individually
- no Core animation when total is zero

## Slot authority / persistence decisions

- Slot RNG and settlement live server-side.
- Shared wallet is server-side.
- Idempotency protects duplicate requests.
- Slot ledger/round persistence exists.
- Legacy browser balance is not trusted as money.
- Legacy `cascade8-balance` localStorage migration is recorded once but should not grant arbitrary server credit.

## Slot math status — IMPORTANT OPEN ITEM

Target remains roughly:
- total RTP **95.5–96.5%**
- hit rate roughly **25–35%**
- desired base/bonus split around **70/30**

A saved 1M-spin report in the repo dated 2026-09-21 shows:
- overall RTP **230.2071%**
- base RTP **194.1915%**
- bonus RTP **36.0157%**
- hit rate **40.4848%**

That saved report is far above target.

Because code continued changing after older simulations, do not assume that report is the final current runtime math. **Before declaring Slot math finished, rerun the simulator using current `GameConfig.ts`.**

---

# 4) ROULETTE — CURRENT MODEL

## Product goal

The Roulette experience should feel like a premium physical roulette wheel, not a flat CSS spinner.

Unlike Cadı Kazan, Roulette **does use real 3D / physics work**.

The project contains:
- European wheel geometry
- Three.js rendering
- GLB roulette asset
- Physics Lab
- server-side roulette round coordinator
- WebSocket snapshot/event flow
- wallet/bet persistence

The user has repeatedly emphasized:
- no ugly physics
- no visibly fake ball behavior
- no sloppy wheel geometry
- no shortcuts that break visual/physical credibility

## European wheel order

Current canonical order:

`0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26`

37 pockets, single zero.

## Current server phases

- OPEN — 15s
- LAST_CALL — 5s
- LOCKED — 1s
- MULTIPLIER_REVEAL — 9s
- SPINNING — 12s
- RESULT — 3.5s
- SETTLING — 3s
- INTERMISSION — 3s

Multiplier reveal step:
**1.5s**

## Current bet types

- Straight
- Split
- Street
- Corner
- Six Line
- Dozen
- Column
- Red
- Black
- Odd
- Even
- Low
- High

## Current Roulette RNG

Winning number:
- server-side crypto `randomInt(0, 37)`
- uniform 0–36

Lucky numbers:
- random unique set
- 1 to 5 lucky numbers per round

Lucky multiplier values:
- 50x
- 100x
- 150x
- 200x
- 250x
- 300x
- 400x
- 500x

Current weights:
- 50: 52
- 100: 24
- 150: 10
- 200: 6
- 250: 3
- 300: 2
- 400: 1.5
- 500: 1

## Current commitment

A SHA-256 commitment is created from:
- roundId
- winningNumber
- luckyNumbers
- multipliers

This is persisted with the round.

## Current physics / visual architecture

Client class:
`RoulettePhysicsReplay`

It currently loads:
- GLB visual source
- `/api/physics-lab/rounds/current`

The replay trajectory is then rotated/yawed to align with the Roulette server target number.

### CRITICAL architectural note

At the moment the ordinary Roulette server chooses the winning number independently through Roulette RNG.

The Physics Lab produces a settled physical replay, but the client reorients that replay toward the already-selected Roulette result.

Therefore the current integration should be treated as:

> **server RNG result + physics replay visualization**

not yet as:

> **the live physical simulation itself determines the Roulette result**

Do not describe the present implementation as a fully physics-determined production roulette until this architecture is intentionally changed and verified.

## Physics Lab

Server files:
`artifacts/api-server/src/physics-lab/`

It can:
- generate a seed
- simulate a round
- persist trajectory
- persist final pocket
- persist event data
- persist trajectory hash
- return current / historical replay

The physics lab is useful for validation and replay, but its relationship to the live Roulette outcome must be consciously defined.

## Current round generation pause behavior

`ROULETTE_ROUND_GENERATION_PAUSED`

Code behavior:
- env values `0 / false / off / no` mean unpaused
- when the env is missing, the code defaults to **paused**

Do not claim the live environment is paused or active solely from code default; runtime env/snapshot must be checked.

## CRITICAL payout issue discovered in code — MUST AUDIT BEFORE RELEASE

Current payout units are:

- Straight 35
- Split 17
- Street 11
- Corner 8
- Six Line 5
- Dozen 2
- Column 2
- Even-money bets 1

But the stake is debited when the bet is placed, and settlement currently credits:

`stake × payoutUnits`

This means, for example:
- a $1 even-money win returns $1 after $1 was already debited → net $0
- a $1 straight win returns $35 after $1 debit → net $34

If the product intends standard European roulette returns, the stake-return semantics are likely off by 1x. This is a **potential critical economy bug** and should be explicitly verified/fixed, not silently ignored.

Lucky-number multiplier semantics should be checked at the same time so the meaning of “50x / 100x …” is consistent.

## Roulette current audit checklist

When the user asks to “inspect Roulette”, ChatGPT itself should verify:

1. Effective runtime value of `ROULETTE_ROUND_GENERATION_PAUSED`
2. Whether `/api/roulette/snapshot` can create/advance fresh rounds
3. Whether the Three.js replay canvas becomes ready in real Preview/WebGL
4. Whether it falls back on browsers/proxy preview
5. Roulette tests
6. Physics Lab tests
7. payout/settlement smoke
8. duplicate/idempotency behavior
9. reconnect/WebSocket snapshot correctness
10. mobile viewport and safe-area
11. result/animation timing synchronization
12. whether live roulette is intended to remain RNG-driven or become physics-outcome-driven

**Do not send this audit to Replit Agent.**

---

# 5) CADI KAZAN — SCRATCH CARD

## Product goal

Cadı Kazan should feel like a physical scratch ticket placed on a table.

It is **not** meant to feel like a grid UI and it does **not** need a real 3D engine.

Use:
- 2D / 2.5D
- CSS transforms
- shadows
- paper/foil textures
- Canvas scratching
- 2D debris particles
- audio
- subtle tactile feedback

No Three.js physics engine is needed for this game.

## Modes

### STANDARD 5

- 5 cells
- exactly 1 bomb
- 4 safe cells
- after each safe reveal, player may cash out
- bomb → BUST, current cashout becomes 0
- fourth safe → COMPLETED

Current multipliers:
- Safe 1 → **1.20x**
- Safe 2 → **1.60x**
- Safe 3 → **2.40x**
- Safe 4 → **4.80x**

These points are designed around ~96% expected return.

### ADVANCED 25

- 25 cells
- 5×5
- selectable bomb count:
  - 1
  - 3
  - 5
  - 7
  - 10

**User-facing terminology must be BOMBA / BOMB.**

Some internal code still uses historical names like `alarmCount` / `ADVANCED_ALARM_OPTIONS`. Internal naming can be refactored later, but the production UI must not show “ALARM”.

Current Advanced table:
- version: `advanced-final-v1`
- target RTP: **96%**
- max multiplier: **1000x**
- generated from survival probability
- cap intentionally reduces the extreme tail in the highest-risk strategies

## Cadı Kazan statuses

- ACTIVE
- CASHED_OUT
- BUST
- COMPLETED

## Server authority

Server determines:
- bomb positions
- reveal outcome
- current multiplier
- payout
- final wallet result

Duplicate reveal must not pay twice.

Cashout must be idempotent.

Active round state must not leak unrevealed bomb positions.

At terminal state:
- reveal all hidden bomb/result cells
- user should be able to see “what was underneath”

## Shared wallet

Cadı Kazan uses the same server wallet/session as Roulette and Slot.

Scratch round and scratch ledger records remain isolated from the other games’ round records.

## The correct scratch rendering architecture

This is a major user-approved rule.

Per cell:

```
CARD / CELL BACKGROUND
↓
RESULT LAYER (SAFE / GOLD / BOMB artwork, opaque)
↓
SCRATCH FOIL CANVAS (opaque coating; erased pixels become transparent)
↓
OPTIONAL SCUFF / DUST / DEBRIS
```

### Never do this

Do not draw the result inside the scratch mask canvas.

Do not make result opacity depend on total scratch progress.

Do not reveal the dark table/cell background through scratched pixels.

### Correct reveal behavior

As soon as the user meaningfully starts scratching a cell:
1. server commits/returns the cell result
2. result DOM/art layer mounts below the foil at full opacity
3. intact foil still hides it
4. every actual erased foil pixel exposes the exact corresponding piece of the result beneath

This matches a real scratch ticket: the print is physically there underneath; scratching only removes coating.

## Scratch feel

- first light movement can create shallow scuff without opening foil
- repeated/friction pass begins actual alpha removal
- brush shape should be irregular/coin-like
- movement must interpolate to avoid gaps at speed
- dust/debris should feel physical
- tiny debris fades quickly
- a few larger flakes may persist ~1–3s
- sound should react to movement/velocity rather than looping one flat MP3
- use several short scratch samples if practical

## Important unresolved visual bug

A recurring failure seen during development:

> scratched regions showed dark/navy holes instead of the actual symbol beneath the coating.

Even if tests pass, this is not acceptable.

Until visually verified in Preview, treat the layered reveal as an open visual QA item.

## Desktop layout

- separate desktop design
- left configuration/control panel
  - mode
  - stake
  - bombs
  - buy card
- center physical tabletop + ticket
- cashout/status outside the card
- ticket should look printed, with paper texture, border, contact shadow

## Mobile layout

Do not simply scale desktop.

- compact wallet/config top
- large card in center
- sticky action area at bottom
- action bar must not cover card
- Advanced 25 cells need large touch targets

## Buy-card ceremony

- user selects mode/stake/bombs
- Buy Card
- server creates round
- card slides/drops onto table
- short settle
- config locks while active
- terminal card clears before next card enters

## Cashout information

Always show both:
- multiplier, e.g. **1.50x**
- actual money/credit amount, e.g. **$150 CASH OUT**

Optionally:
- Stake $100
- Net +$50

---

# 6) SHARED ENGINE / WALLET WORK ALREADY COMPLETED

Important milestones already implemented/validated in prior work:

- Slot, Roulette and Cadı Kazan use the shared server wallet.
- Slot was moved away from browser-authoritative money/RNG flow.
- Slot round/ledger persistence exists.
- Duplicate/idempotency protections were added.
- Legacy local balance migration was constrained so browser data cannot arbitrarily mint server credits.
- Cross-game wallet consistency was QA’d in earlier iterations.
- Terminal scratch reveal behavior was added as a requirement.
- Roulette received server round phases, persistence, realtime snapshots and Physics Lab infrastructure.

Do not casually revert these architecture decisions during visual fixes.

---

# 7) VISUAL / PRODUCT QUALITY RULES

These rules apply across the project:

- Mobile is a first-class layout, not a shrunken desktop.
- Avoid unnecessary boxes and decorative chrome that steals playable space.
- Main interaction area should fit the viewport when possible.
- Important game status should be readable without scrolling.
- Server result must remain authoritative even if animation is interrupted/reloaded.
- Animation should follow game state; game state must not depend on animation finishing correctly.
- Reduced motion / turbo may change timing, never math/RNG.
- No “fix” is complete only because unit tests are green if the visible gameplay still looks wrong.
- For physics/animation bugs, validate in real Preview/WebGL when the issue is visual.
- Preserve premium, restrained presentation rather than casino-neon clutter.

---

# 8) OTHER OYUN ROADMAP CONTEXT

These systems exist in planning/history but are secondary to the current Slot/Roulette/Cadı Kazan work.

## Football player pack opening

General concept:
- same overall app economy
- 1 pack gives 1 footballer
- pool/deck behavior has been discussed extensively
- a finite-player-pool model is being explored
- premium FC-style pack-opening presentation
- not meant to feel like another slot

Do not finalize its economy from old drafts without checking the latest user instruction first.

## Idle / passive-income systems

Separate progression concepts exist for:
- Stadium
- Club Store
- Fan Club
- earlier Coffee Economy prototypes

These are not the immediate current engineering priority unless the user returns to them.

---

# 9) LATEST PROJECT HISTORY / HANDOFF TIMELINE

Use this to understand how we reached the current state.

### Stage 1 — Slot foundation
- 6×5 Cascade 8 built
- anywhere-pays tumble flow
- football club symbols
- Free Spins
- multiplier Cores
- mobile UI iterations
- RTP simulations and packet/pair experiments

### Stage 2 — Roulette foundation
- Roulette UI added
- European wheel mapping
- server round coordinator
- betting + shared wallet
- lucky multipliers
- WebSocket phase flow
- 3D/GLB exploration
- Physics Lab built in parts
- physical track/pocket/ball diagnostics performed

### Stage 3 — Cadı Kazan
- third playable game added
- Standard 5 and Advanced 25
- shared wallet
- server-authoritative bomb/result flow
- scratch interaction iterations
- desktop/mobile physical-ticket redesign
- layered scratch architecture defined

### Stage 4 — Shared wallet hardening
- Slot moved to server authority
- duplicate request protection
- ledger/round storage
- migration safeguards
- cross-game balance QA

### Stage 5 — GitHub direct-development setup
- GitHub plugin connected
- repo: `hazardyk27-sudo/bok`
- Replit project pushed through `replit-upload`
- GitHub `main` moved to the real project
- GitHub `main` is now canonical

### Stage 6 — New working agreement
User clarified:
- ChatGPT itself must perform audits
- do not ask Replit to inspect itself
- ChatGPT should write code through GitHub
- Replit should be used only as sync/runtime/Preview for this workflow

One audit-only instruction was mistakenly sent to Replit before this rule was clarified. Do not repeat that pattern.

---

# 10) CURRENT NEXT TASK

As of this memory update, the next technical task is:

> **Deeply inspect Roulette and report where it is incomplete, wrong, fragile or visually/physically inconsistent.**

This audit must be performed by ChatGPT itself from GitHub/runtime evidence.

Priority items already visible from code:

1. Verify the likely roulette payout-return bug caused by debiting stake and then crediting only `stake × payoutUnits`.
2. Verify effective runtime `ROULETTE_ROUND_GENERATION_PAUSED`.
3. Verify fresh round generation and phase progression.
4. Verify 3D replay readiness in real Preview/WebGL.
5. Verify whether fallback is being used.
6. Run/inspect Roulette and Physics Lab tests.
7. Verify a real payout/settlement smoke path.
8. Decide/document whether live outcome should remain server RNG + replay or eventually become physics-determined.
9. Check mobile viewport and result presentation.
10. Check animation/server-clock synchronization and reconnect behavior.

Do not change Roulette while merely auditing unless the user explicitly says to implement fixes.

---

# 11) MEMORY MAINTENANCE RULE

After an approved meaningful change, update this file.

At minimum update:
- **Last updated**
- affected game section
- **LATEST PROJECT HISTORY / HANDOFF TIMELINE**
- **CURRENT NEXT TASK**

If a numeric rule changes, replace the old current value rather than accumulating contradictory “current” values.

Historical decisions that are useful for context may remain, but label them clearly as historical/obsolete.

The purpose of this file is not to be a changelog dump. It is to make the next conversation immediately operational.
