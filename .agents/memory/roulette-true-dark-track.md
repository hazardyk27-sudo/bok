---
name: Roulette true dark track geometry
description: The uploaded roulette GLB's actual recessed outer ball channel and neighboring wood/inner-edge bands.
---

The transformed `rou-lp-test-04.glb` does not place the recessed outer ball channel at the former 2.7200–2.9000 assumption. Radial intersections of the actual meshes identify the dark channel at approximately r=2.2700–2.5400, with center r=2.4050 and surface Y approximately -0.3672 to -0.2477. The outer wood band begins around r=2.4700 and extends to about r=2.9900; the nearest inward edge/deflector region is approximately r=2.1800–2.2600. A ball center at r=2.3900 and Y=-0.2671 passes a static actual-GLB trimesh contact check with wood clearance 0.0240 and inward-edge clearance 0.0740.

**Why:** The prior launch radius near 2.784 visually ran on the wood ring even though a hard-coded surface probe reported the assumed dark band.

**How to apply:** Before any outer-spin tuning, sample transformed GLB intersections and launch only from the measured lower surface branch. Keep the static contact check separate from lap tuning; do not reuse the former 2.7200–2.9000 band.