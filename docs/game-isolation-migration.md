# Game isolation migration

This branch builds the permanent isolation model without changing the Replit preview until validation is complete.

## Invariants
- Existing game visuals and behavior must remain unchanged during migration.
- Each normal game promotion may change only the target game's ownership roots.
- Shared files are frozen for normal game promotions.
- Other game trees must remain byte-for-byte unchanged by promotion.
- Replit remains on integration/replit-preview.

## Migration order
1. Add ownership contract and mechanical guards.
2. Move Hub routing/markup out of shared main.ts.
3. Move Slot entry/UI out of shared main.ts and styles.css.
4. Move Roulette entry/markup into a Roulette-owned folder.
5. Move Cadı Kazan entry/styles into a Cadı-owned folder.
6. Keep Idle fully scoped under its owned folder and verify CSS isolation.
7. Split DB schema exports by game; leave only aggregation in the shared index.
8. Validate build, typecheck, smoke tests and route parity.
9. Promote the migration only after all four games match their approved snapshots.


## Progress
- Part 1: ownership and promotion foundation — complete.
- Part 2: Hub markup/mount/test moved into Hub ownership — complete.
- Part 3: Roulette markup, mount, CSS, client, geometry and production replay runtime moved into Roulette ownership — complete.
- Part 4: Cadı Kazan mount, client, CSS, scratch runtime/tests and Cadı-specific audio moved into Cadı Kazan ownership — complete.
- Parts 5–8 remain on this migration branch until final validation.
