---
name: Roulette mobile heading wrapping
description: Prevent narrow roulette betting headers from creating hidden horizontal geometry failures.
---

At narrow roulette widths, the betting card heading must allow its tool buttons and odds note to wrap within the card. Otherwise their desktop intrinsic width can widen the card and push an absolutely positioned mobile utility rail beyond the viewport while page-level overflow masking hides the problem.

**Why:** Enlarged control text exposed the issue in portrait mobile layouts; the document reported no horizontal overflow even though the controls were visually outside the viewport.

**How to apply:** When changing mobile roulette heading controls or text sizing, check both card bounds and each utility label's bounds, not only document scroll width.