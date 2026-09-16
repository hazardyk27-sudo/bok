---
name: Roulette animation synchronization
description: Wheel and ball presentation must derive progress from the server phase clock while the result remains server-authoritative.
---

The roulette wheel and ball should animate as separate layers, but their phase progress must be initialized from `phaseStartedAt` plus the client’s server offset. The landing target is always the server-selected pocket; animation never determines the result.

**Why:** Clients can enter a round at different times, and starting a local animation at zero makes the same server round look inconsistent across browsers.

**How to apply:** Offset repeating spin animations by elapsed phase time, then use the authoritative winning number to drive the final rotor alignment and ball drop. Capture the ball’s live orbital angle before replacing its animation so landing never resets to a new orbit. Keep the ball’s pocket-drop radius aligned with the visual pocket-ring radius, and counter-rotate final labels from the live rotor transform while it animates, then freeze the final angle when it settles. When CSS custom properties contain `clamp()` values, resolve them through layout rather than parsing the first numeric token, or responsive animation will use the wrong radius. Reduced-motion support must also branch the JavaScript Web Animations API path; disabling only CSS animations leaves the rotor and ball moving. Gate visible result labels and winning-pocket highlights on visual landing completion rather than on the first server result snapshot. When a tab becomes visible again, refresh the authoritative snapshot and either advance active landing animations to the server phase elapsed time or settle immediately if the result phase has passed.

Phase schedule changes must interpret an in-flight round from its persisted boundary ordering before applying the current phase order. New rounds can adopt the new sequence without interrupting the 24/7 global round already in progress.

**Why:** Roulette rounds are persisted globally, so a server restart or deploy can occur midway through a round created with the previous schedule.

**How to apply:** Compare the stored reveal and spin boundaries, use the matching phase order for phase start/end and reveal elapsed time, and only expose the winning number when that schedule’s result phase begins.