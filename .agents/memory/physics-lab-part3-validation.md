---
name: Physics Lab Part 3 validation
description: Dynamic roulette-ball validation needs stable compound-collider test placement and a catch floor.
---

Use sector-interior release angles and avoid starting a dynamic sphere exactly on segmented collider seams; seam-edge starts can turn a legitimate contact test into a numerical velocity explosion.

**Why:** Compound box rings have discrete edges, and high drops onto a seam or deflector corner can produce non-representative solver impulses even with CCD enabled.

**How to apply:** Keep release positions varied in radius, height, direction, and speed, but center them inside physical track/pocket regions. Include a broad stationary bowl catch floor under the rotor so bounds failures represent actual tunneling rather than an unmodeled open underside. Verify the final report with direct Chromium + SwiftShader because the preview screenshot browser may lack WebGL.