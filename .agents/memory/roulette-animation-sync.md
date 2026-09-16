---
name: Roulette animation synchronization
description: Wheel and ball presentation must derive progress from the server phase clock while the result remains server-authoritative.
---

The roulette wheel and ball should animate as separate layers, but their phase progress must be initialized from `phaseStartedAt` plus the client’s server offset. The landing target is always the server-selected pocket; animation never determines the result.

**Why:** Clients can enter a round at different times, and starting a local animation at zero makes the same server round look inconsistent across browsers.

**How to apply:** Offset repeating spin animations by elapsed phase time, then use the authoritative winning number to drive the final rotor alignment and ball drop. Keep the ball’s pocket-drop radius aligned with the visual pocket-ring radius, and counter-rotate final labels when the rotor settles at a non-zero angle.