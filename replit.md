# Cascade 8

Virtual-credit cascading slot-style browser game with a Phaser board, pure TypeScript math engine, deterministic simulator, and responsive controls.

## Isolation v2 / Replit branch

- Replit must stay on `integration/replit-preview`; `main` is not the preview branch.
- Normal game development happens on the game's feature branch and inside its ownership roots.
- Feature commit != preview release. Use the one-game promotion flow, then fast-forward Replit with `bash scripts/replit-sync-preview.sh`.
- Do not switch Replit to feature branches and do not use hard reset/rebase/force push to repair preview state.

## Run & Operate

- `pnpm run dev` — run the `artifacts/cascade-8` Vite preview
- `pnpm run typecheck` — full typecheck across workspace packages
- `pnpm run build` — typecheck + build `artifacts/cascade-8`
- `pnpm test` — run the `artifacts/cascade-8` regression suite
- `pnpm run simulate -- --spins=100000 --seed=12345` — run the deterministic `artifacts/cascade-8` simulator

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/cascade-8/src/config/GameConfig.ts` — single source of truth for symbol weights, paytable, bonus rules, crystals, bets, and max win.
- `artifacts/cascade-8/src/engine/` — Phaser-independent board generation, evaluation, cascades, bonus logic, and seeded/crypto RNG.
- `artifacts/cascade-8/src/game/` — Phaser scene, controller state machine, and WebAudio effects.
- `artifacts/cascade-8/src/simulation/` — high-speed simulator, CLI, and saved reports.
- `artifacts/cascade-8/src/main.ts` — route dispatcher only. Game-specific mount/runtime/CSS live in their owned areas; shared `styles.css` is platform/shared and not a normal game-edit target.
- `/lab` — development-only deterministic board harness in the canonical artifact.

## Architecture decisions

- `artifacts/cascade-8` is the only product game engine and simulation source of truth.

- Phaser renders pure board data; it never owns the math state.
- Paid spins charge once and credit once after base cascades and any bonus complete.
- Browser crypto randomness is used only for this virtual-credit prototype; the simulator shares the same interface with a seeded PRNG.
- Crystal calibration is static and documented in `README.md`; no player history or balance affects outcomes.

## Product

The app supports 6 × 5 anywhere-pays, simultaneous symbol wins, cascades, scatter-triggered free spins, retriggers, free-spin multiplier crystals, max-win capping, bet controls, turbo, sound, reduced motion, settings, paytable info, and a local demo-credit reset.

## User preferences

- Keep the game virtual-credit only; do not add deposits, withdrawals, cash-out, or payment processors.

## Gotchas

- The root workspace delegates product development, testing, simulation, and builds to `artifacts/cascade-8`.
- Do not move symbol probabilities into Phaser/UI code or make them depend on bet, balance, or player history.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
