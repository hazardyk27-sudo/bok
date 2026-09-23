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

Mandatory approval flow:

1. ChatGPT inspects the relevant GitHub files.
2. **Before changing code, ChatGPT explains the implementation plan to the user.**
3. **Do not edit GitHub until the user explicitly approves with wording such as “tamam / kodla / uygula”.**
4. After approval, ChatGPT writes the code change in GitHub directly and commits it.
5. User manually syncs GitHub `main` into Replit from Shell and refreshes Preview.
6. User checks the result visually in Replit Preview.
7. If rejected, repeat the same plan → approval → code cycle.

**Replit Agent is not the primary code author in this workflow.**

## C. GitHub → Replit manual Shell sync rule

The user has chosen **manual Shell sync after every GitHub change**. Do not ask Replit Agent to sync unless the user explicitly changes this rule.

After ChatGPT changes `main`, give the user the short Shell flow:

`git fetch github main`  
`git merge --ff-only FETCH_HEAD`

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

## Scratch reveal — current implementation direction

The scratch interaction has now been changed toward the approved physical model:

- result is server-committed on the first meaningful scratch gesture rather than waiting for ~62% coverage
- the result layer is mounted underneath the foil while the foil remains in place
- active scratching no longer auto-clears the whole foil at a coverage threshold
- only locally abraded/erased pixels expose the result underneath
- safe result artwork is a premium **gold lucky symbol** (gold clover-style mark)
- terminal states may still fully reveal the remaining results

This must still be visually verified in Replit Preview. If dark/navy holes appear instead of the symbol under the foil, treat it as a blocking visual bug.

## Desktop layout

Current target/implementation is based on the approved premium mockup:
- dark midnight/navy + champagne-gold visual system
- refined top title/status hierarchy
- premium left control panel for mode / stake / bombs / Buy Card
- large physical ivory-gold scratch ticket as the visual hero
- subtle tabletop props and depth around the ticket
- premium right-side KAZANÇ / multiplier / amount / Cash Out panel
- restrained borders, glow, shadows and serif display typography
- ticket should look printed and physical, with paper texture, ornate edge treatment and contact shadow

## Mobile layout

Do not simply scale desktop.

- **Portrait:** compact header/status, setup panel before the round, large full-width ticket while playing, sticky payout/Cash Out bar at the bottom
- once a mobile round is active, setup controls can collapse/hide so the scratch ticket gets priority
- **Landscape mobile:** explicit horizontal layout is supported; compact setup left, ticket center, payout panel right
- action UI must never cover the scratch area
- Advanced 25 must remain touch-usable

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

### Stage 7 — Cadı Kazan premium rebuild
- approved a premium desktop visual direction with ivory-gold physical ticket, dark mystical tabletop, left setup panel and right payout panel
- rebuilt Cadı Kazan layout in GitHub to follow that design direction
- added premium desktop styling, portrait mobile layout and dedicated landscape-mobile layout
- changed scratch behavior so a meaningful scratch commits the server result early and locally erased pixels reveal the result underneath
- removed active-round threshold-driven full-mask auto-clear behavior
- safe scratch result is now a gold lucky symbol

### Stage 8 — Global scroll fix
- root cause of non-scrolling pages was global viewport locking in `styles.css`: `.app-shell { overflow: hidden }`, `.route-shell { height: 100dvh; overflow: hidden }`, and `.route-shell.is-menu-page { overflow: hidden }`
- restored document-level vertical scrolling while retaining horizontal clipping
- menu, game routes and slot shell can now extend beyond the viewport instead of being clipped
- removed the Cadı Kazan landscape-only height/overflow trap so short landscape screens can scroll vertically when needed

### Stage 13 — Cadı Kazan V2 fit, dollars, landscape mobile
- created Figma V2 frames before coding: Desktop Standard `9:2`, Desktop Advanced 25 `9:54`, Mobile Landscape `9:132`
- the Advanced 25 ticket now has a dedicated compact layout intended to keep the full 5×5 grid inside the stage without colliding with the payout HUD
- reserved a separate payout lane and increased spacing between the ticket and payout HUD
- Cadı Kazan user-facing money display is now dollar-based (`$100.00`, `+$20.00`) rather than CR/kredi
- stake input is direct text entry with $25/$50/$100/$250/$500/MAX shortcuts; the old apparent $100 UI ceiling is removed, while server wallet/storage-safety validation remains authoritative
- mobile is landscape-first: portrait shows a rotate-device handoff; landscape uses a compact header, fitted ticket/HUD, and fixed touch-friendly bottom control dock
- scratch material was refined with pressure-sensitive abrasion, denser stroke interpolation, translucent lacquer, brushed foil, textured base coat, grooves and richer debris while preserving anti-spoiler settlement thresholds
- Playwright Cadı Kazan QA was updated to exercise a $250 Standard stake and an Android landscape Advanced-25 fit check
- runtime/visual verification in Replit Preview is still required after manual sync; do not call this pass finished until the Preview is checked

### Stage 12 — Figma master → code
- user explicitly required the workflow to be Figma first, then code
- created Figma file `Cadı Kazan Premium UI Master` and built an editable desktop master screen with compact header, centered ivory scratch ticket, floating payout HUD, and bottom control dock
- implemented that Figma hierarchy in GitHub instead of continuing the old left-panel/right-panel dashboard composition
- Cadı Kazan desktop shell now uses a single cinematic stage, hero ticket, floating payout panel, and one horizontal control dock
- preserved existing scratch/server/gameplay selectors and logic while replacing the visible layout and visual system
- responsive portrait and landscape mobile rules were rebuilt around the new shell
- current Figma file key: `XgXVR6fYzZ6Tj11J8M6bha`
- current design master node: `3:2`

### Stage 11 — Scratch anti-spoiler + premium visual pass
- result settlement is no longer requested on pointer-down; a tiny scratch does not immediately trigger bomb/multiplier outcome
- reveal request now requires meaningful local scratch: minimum deep coverage, minimum gesture duration and minimum scratch travel
- three coating layers still wear progressively before the committed result is exposed
- added E2E coverage ensuring a light scratch does not settle/reveal the result
- replaced flat safe/bomb artwork with CSS-rendered gold-ingot and dark-metal bomb treatments
- introduced a more distinctive petrol / aubergine / antique-gold interface palette and fixed the desktop back/menu alignment
- ticket now includes a dynamic printed price badge such as `$100`
- removed the old frontend 100-credit stake cap; server accepts larger stakes subject to wallet and storage-safe payout bounds

### Stage 10 — Three-layer scratch coating
- scratch cells now use three real stacked canvases above the result: base coat, metallic foil and glossy lacquer
- abrasion is intentionally progressive: first passes wear lacquer, repeated passes expose foil, deeper repeated passes remove the base coat and reveal the committed result
- server result request starts on pointer-down so the result can be ready underneath while the player is physically scratching
- deepest/base-layer removal is held until the server result is committed; then the buffered scratch trail is replayed so the already-scratched path reveals correctly
- abrasion depth was slowed substantially so one swipe cannot behave like an instant reveal
- no global percentage threshold is used to auto-clear an active cell

### Stage 9 — Cadı Kazan hierarchy + scratch rebuild
- removed the duplicated Cadı Kazan route-header look by hiding the generic route topbar on this page and using one integrated app header
- rebuilt desktop hierarchy around a single aligned shell: app header, compact setup panel, hero ticket table, compact payout panel
- removed noisy fake tabletop props and replaced them with restrained light/emblem layers
- rebuilt the ticket material toward ivory/champagne paper with stronger print contrast and cleaner borders
- simplified controls by removing stake preset clutter from the visible UI
- rewrote scratch interaction so pre-result scratch movement is buffered; when server result commits, the entire already-scratched trail is replayed as real foil removal
- removed the dark blotch-style scratch painting; pre-result feedback is now fine metallic scuff lines
- lowered local abrasion reveal depth so the result becomes visible naturally as foil is scratched
- safe result is rendered as a premium gold medallion/symbol rather than a dark hole
- responsive rules were rebuilt for desktop, portrait mobile and landscape mobile

---

# 10) CURRENT NEXT TASK

As of this memory update, the next task is:

> **Manually sync GitHub main in Replit Shell, then verify the Cadı Kazan V2 Preview: Standard and Advanced 25 fit, $250+ stake, dollar-only display, ticket/HUD gap, landscape mobile, text alignment and premium scratch feel.**

Priority checks:
1. Desktop should visually read as the approved premium mockup, roughly 80%+ similar in hierarchy/composition.
2. Ticket must be centered and dominant, not stuck to the bottom.
3. Gold lucky symbol must be visible progressively through only the pixels actually scratched.
4. No active-round threshold should suddenly reveal the entire cell.
5. Left setup and right payout panels must be readable and premium without crowding the ticket.
6. Portrait mobile must prioritize the ticket and use the sticky payout bar correctly.
7. Landscape mobile must render the intended left / ticket / right horizontal layout.
8. Fix any compile/runtime/layout regression found in Preview before moving back to Roulette audit.

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
