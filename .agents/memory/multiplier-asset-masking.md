---
name: Multiplier asset masking
description: Constraints for turning supplied multiplier portraits into reusable circular game artwork.
---

Supplied multiplier portraits can include a square background and a small repeated value caption below the main emblem. Final game artwork should crop below the main emblem first, then apply a transparent circular alpha mask before resizing for UI use.

**Why:** masking the full source crop preserves the unwanted caption and makes the “circular” asset look like a square image inside the lab and game board.

**How to apply:** use the source portraits for the mapped values only; keep high-value fallbacks text-based when no supplied portrait exists, and verify alpha corners plus the visible lab grid.