---
name: Procedural pocket validation
description: Constraints for validating procedural roulette bowl openings, pocket support, and kinematic rotor contacts.
---

 A procedural roulette bowl should end at a deliberate pocket aperture, while the pocket floor must provide continuous support beneath the full capture area. Rounded, shared boundary frets can pass a direct pocket drop yet still eject or tunnel a launched ball when carried by a rotating kinematic body, so short smoke runs must check real settling and escape independently.

**Why:** A shared mesh/collider scale can still fail at the transition between the bowl and pocket geometry; a zero-drop pass does not prove a launched ball can enter, remain in, and settle in a pocket. Direct pocket drops can pass while moving-fret contacts still create extreme outgoing velocity.

**How to apply:** Validate the bowl aperture first, then run only a small number of varied launches and record outer laps, inward transition, rotor contact, final pocket, maximum speed, and escape/tunneling flags before accepting the design.

For a rotating pocket, classify rest from ball velocity relative to the rotor’s local tangential velocity, while keeping world-space maximum speed as the velocity-explosion guard.

**Why:** A physically settled ball can co-rotate with a slow kinematic rotor and therefore retain modest world-space velocity without slipping or receiving injected energy.

**How to apply:** Use rotor-relative speed for stable-settle windows; use absolute world speed, escape bounds, and CCD/tunneling flags separately for safety acceptance.

The lower faces of kinematic pocket frets must clear the continuous pocket floor instead of extending through it; direct-entry geometry validation should phase-lock the rotor and keep PART 4 baseline acceptance isolated.

**Why:** A moving separator that overlaps the floor can push a ball downward through the support surface, and adding unvalidated pocket geometry to the established rotor probe can hide whether a regression belongs to PART 4 or the new pocket system.

**How to apply:** Place fret bottoms just above the floor, validate center/positive-side/negative-side entries in their own 120 Hz CCD worlds, then keep the legacy rotor probe world comparable until pocket validation passes.