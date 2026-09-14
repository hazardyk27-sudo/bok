---
name: Phaser preview texture readiness
description: Readiness constraint for deterministic Phaser previews that render image-backed board symbols.
---

Deterministic Phaser previews that start immediately after constructing the game can render image-backed symbols before their textures are ready. Delay the preview until the scene has completed its asset load; otherwise screenshots can show placeholder or broken texture boxes even though the normal interactive flow is fine.

**Why:** The `/lab` win-label preview was initially started as soon as the controller existed, before club-logo textures were ready.

**How to apply:** Keep automatic lab/demo playback behind a short readiness delay or an explicit scene-ready signal; manual lab buttons remain safe because users invoke them after the page has loaded.