---
name: Phaser effect cleanup
description: Performance behavior when Cascade 8 rebuilds Phaser board nodes and their animated children
---

When a board node is destroyed during a rebuild or burst, kill tweens for the container and every child target before destroying the container. Fire-and-forget round effects such as win labels must also register a completion callback that round reset can invoke.

**Why:** Rebuilding a cascade board repeatedly can leave animated child targets managed by Phaser longer than the visible node. Long-lived unowned label tween chains can then overlap later Turbo rounds, causing gradual frame drops and intermittent stutter, especially on Canvas/mobile renderers.

**How to apply:** Keep board effects grouped under their node, explicitly clean container and child tweens during clear/burst teardown, resolve cancelled animation promises once, and cap burst particles when many cells win at once. Long-session checks should finish at zero round-owned labels, effects, and tweens.