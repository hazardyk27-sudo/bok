---
name: Roulette portrait flow
description: Durable layout rule for the mobile portrait roulette surface and its compact controls.
---

Portrait roulette controls should remain in normal document flow immediately before the phase-dependent play surface. Do not make the compact control dock fixed over the betting table.

**Why:** A fixed dock looked convenient at common heights but covered lower number cells on short phones and the table below the wheel on taller portrait screens. Flow placement keeps betting, Lucky, and multiplier rows reachable without relying on scroll padding.

**How to apply:** Keep the portrait page/table/wheel widths explicit, place the dock before the phase layout, and verify 320×568, 360×740, 390×844, and 430×932 for both horizontal overflow and dock/content overlap.