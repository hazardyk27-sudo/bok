---
name: Roulette audio timing
description: Durable rules for roulette voice announcements and physical Web Audio feedback.
---

Roulette audio should be enabled silently by the first real interaction to satisfy browser audio locks, while the compact sound toggle remains the explicit mute/unmute control. Speak only round rhythm events, and announce the result after visual landing settles.

**Why:** Enabling speech on every bet click created UI-noise, while announcing a result before the ball reached its pocket broke the perceived timing. The wheel bed, outer-track roll, deflector hit, fret bounces, settle, and multiplier lightning need separate cues tied to the same animation clock.

**How to apply:** Keep phase phrases exact and sparse, format result number/color in Turkish, defer a winning multiplier phrase until after the result phrase, and derive spin/roll cadence from the active ball animation duration rather than an unrelated timer.