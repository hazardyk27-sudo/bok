---
name: LP Test 04 asset role
description: Integration boundary for the uploaded rou_LP_Test_04 roulette model.
---

The `rou_LP_Test_04` export contains only three mesh parts (`inside`, `outside`, and `turret`) and does not provide a verified pocket-by-pocket number layout.

**Why:** Replacing the validated European 37-pocket geometry with this compact visual export would make the rendered wheel and result mapping disagree.

**How to apply:** Use the GLB for the visible shell/inner rotor presentation, while keeping the canonical 37-pocket sequence, collider measurements, and result authority separate. Treat the source's Sketchfab metadata and CC-BY attribution as part of the asset audit.