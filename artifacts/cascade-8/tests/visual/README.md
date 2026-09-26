# Cadı Kazan Visual Lock

This folder contains the Playwright visual-regression gate for the Cadı Kazan UI.

## What is deterministic

The test intercepts `/api/cadi-kazan/state` and supplies a fixed Standard 5 round:
- balance: $1,000.00
- stake: $1.00
- 5 covered cells
- 1 bomb
- no revealed cells
- payout: $0.00

That keeps the visual test independent from wallet/server randomness.

## Reference images

Approved master screenshots belong here:

- `references/desktop-1920x1080/cadi-kazan-standard-active.png`
- `references/desktop-1366x768/cadi-kazan-standard-active.png`
- `references/mobile-844x390/cadi-kazan-standard-active.png`

Do **not** generate baselines from a known-bad UI and treat them as approved design.
The reference image is the design contract.

## Commands

Install the Chromium browser once:

`pnpm --filter @workspace/cascade-8 run test:visual:install`

Run all Cadı Kazan visual comparisons:

`pnpm --filter @workspace/cascade-8 run test:visual:cadi`

Desktop only:

`pnpm --filter @workspace/cascade-8 run test:visual:cadi:desktop`

Horizontal mobile only:

`pnpm --filter @workspace/cascade-8 run test:visual:cadi:mobile`

Only after an approved master changes intentionally, update Playwright snapshots:

`pnpm --filter @workspace/cascade-8 run test:visual:cadi:update`

## Gate

Default visual tolerance is intentionally strict:
- per-pixel threshold: 0.12
- maximum differing pixels: 2% of the screenshot

A failed comparison produces the expected / actual / diff artifacts in Playwright test output.
