---
name: Game route viewport fit
description: Durable layout rule for keeping the game menu, Slot, Roulette, and Cadı Kazan inside the viewport.
---

Treat game routes as fixed play surfaces rather than document pages. Keep the route shell at the dynamic viewport height and make the active board or table consume the remaining flex space. Secondary history, inside-bet tools, and inactive Roulette surfaces belong in drawers or phase-specific states; they must not force page-level vertical or horizontal scrolling.

**Why:** Long route content was technically clipped by overflow rules but still placed important play surfaces below the viewport at mobile and short desktop heights. A fixed shell alone is not sufficient; child layouts must be flex-shrinkable and every height-based empty state must participate in the same flex column.

**How to apply:** Scope viewport-fit rules to route classes so Slot and Roulette gameplay/physics remain isolated where needed. Test menu, Slot, Roulette betting and wheel phases, and Cadı Kazan empty and active states at narrow mobile, tablet, normal desktop, and short desktop sizes.