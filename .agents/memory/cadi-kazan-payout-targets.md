---
name: Cadı Kazan payout targets
description: Durable selector rule for the mobile payout bar and its render updates.
---

Never reuse the same data attribute for a payout value and the sticky action container. Render code updates all matching payout nodes, so a parent/container match can replace its buttons and multiplier with plain text.

**Why:** A shared selector caused the mobile action bar contents to be overwritten during normal payout rendering, and CSS display rules could make the hidden empty bar visible.

**How to apply:** Give the container its own selector, target only the value node for text updates, and explicitly style hidden fixed action bars with `display: none`.