---
name: Mobile ceremony layering
description: The mobile relationship between bonus ceremonies, the control dock, and Free Spin result panels.
---

Mobile bonus ceremonies should render in an app-level overlay layer rather than inside the board container, and the active overlay should remove the dock from the mobile hit area. Free Spin totals need an explicit non-shrinking result row after the board.

**Why:** The compact shell is height-constrained and the board is a nested stacking/overflow context. A ceremony action can become visually covered by the dock, while a result panel can be pushed below the visible game area even though controller state and classes are correct.

**How to apply:** Keep desktop layering unchanged. On mobile, use safe-area-aware overlay padding, a scrollable ceremony panel, mobile-only dock suppression while the overlay is open, and a flex-preserved result panel for active Free Spin totals.