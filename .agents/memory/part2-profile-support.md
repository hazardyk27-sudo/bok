---
name: PART 2 profile support
description: Non-obvious Rapier behavior when a dynamic sphere rolls across a sparse open radial bowl profile.
---

An open triangulated radial shell can allow a dynamic sphere to roll below the measured top surface even with CCD and internal-edge flags. A thin ring underlay derived from each profile point, with radial spans based on neighboring profile spacing rather than a fixed width, preserves contact without creating elevated shelves. A horizontal inner-floor catch closes the remaining center gap.

**Why:** The zero-velocity drop initially contacted the measured outer profile correctly, then crossed below it while rolling inward; a fixed-width support ring later caused a false high contact because a farther profile point reached into an earlier height.

**How to apply:** Keep the measured profile as the primary low-complexity collider, add local-spacing support only where the shell is open or sparse, and validate first-contact height, penetration, pass-through, and final rest together.