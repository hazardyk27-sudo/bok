---
name: Roulette Part 1 visual decomposition
description: Physics Lab Part 1 standardizes the roulette visual coordinate system and verifies the imported number ring.
---

Use 6 normalized world units as 1 physical meter. The imported visual number ring matches the European single-zero sequence exactly when indexed from 0 at +Z / 6 o’clock and advanced clockwise toward 32; each index advances by 360/37 degrees.

**Why:** Future physics sectors must share the visual origin and orientation without inheriting an off-by-one or clockwise/counter-clockwise mismatch from the premium asset.

**How to apply:** Keep the stationary bowl and rotating rotor as separate visual groups around the exact origin, and keep any future collision representation separate from the high-poly visual meshes.