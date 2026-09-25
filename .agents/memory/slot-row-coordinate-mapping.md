---
name: Slot row coordinate mapping
description: Defines the non-obvious relationship between logical Slot rows and the board's visual storage order.
---

Slot pair rules use bottom-up logical rows: the visible bottom is logical row 0 and the visible top is logical row 4. The board data used by rendering remains stored top-down, so logical row 0 corresponds to the last board row and logical row 4 to the first.

**Why:** Treating the first board-array row as logical row 0 moves the intended 75% pair behavior to the top of the screen even though internal packet tests can still pass.

**How to apply:** Keep rendering order unchanged. Translate between bottom-up logical pair positions and top-down board storage whenever generating initial columns, evaluating visible refill neighbors, or testing row-specific pair behavior.