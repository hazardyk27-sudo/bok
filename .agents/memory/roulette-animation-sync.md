---
name: Roulette animation synchronization
description: Wheel and ball presentation must derive progress from the server phase clock while the result remains server-authoritative.
---

The roulette wheel and ball should animate as separate layers, but their phase progress must be initialized from `phaseStartedAt` plus the client’s server offset. The landing target is always the server-selected pocket; animation never determines the result.

**Why:** Clients can enter a round at different times, and starting a local animation at zero makes the same server round look inconsistent across browsers.

**How to apply:** Offset repeating spin animations by elapsed phase time, then use the authoritative winning number to drive the final rotor alignment and ball drop. Keep the ball’s pocket-drop radius aligned with the visual pocket-ring radius, and counter-rotate final labels from the live rotor transform while it animates, then freeze the final angle when it settles. When CSS custom properties contain `clamp()` values, resolve them through layout rather than parsing the first numeric token, or responsive animation will use the wrong radius. Reduced-motion support must also branch the JavaScript Web Animations API path; disabling only CSS animations leaves the rotor and ball moving.