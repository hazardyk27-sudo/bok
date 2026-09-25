---
name: Roulette safe-area coverage
description: Deterministic safe-area handling for roulette mobile layout and browser tests.
---

Mobile safe-area values should be exposed through custom properties with `env()` fallbacks, so browser tests can emulate non-zero insets without relying on device-specific environment support. Compact landscape should keep the result overlay inside the safe viewport even when the scrollable wheel card itself is taller than the viewport.

**Why:** Playwright cannot reliably override native `env(safe-area-inset-*)` values, and a phone landscape page may scroll while the visible result must still clear the home indicator.

**How to apply:** Use shared inset variables for shell and overlay bounds, apply an explicit compact landscape rule for phone-sized viewports, and include both inset values and computed shell padding in geometry failure diagnostics.