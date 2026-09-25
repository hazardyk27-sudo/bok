---
name: Responsive media scoping
description: How compact viewport CSS can unexpectedly affect desktop layouts
---

Compact landscape media queries can match desktop viewports when they only test height or orientation. A fixed-height child inside a flex column can then shrink its parent and hide content even when the child keeps the intended aspect ratio.

**Why:** The board correction initially appeared ineffective because a global short-landscape rule still forced the desktop board wrapper to a smaller fixed height and clipped the lower rows.

**How to apply:** Scope compact landscape rules to the mobile breakpoint when they describe mobile controls, or add an explicit desktop override that restores natural aspect-ratio flow and removes the fixed-height clipping.