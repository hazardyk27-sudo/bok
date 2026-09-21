---
name: Procedural pocket validation
description: Constraints for validating procedural roulette bowl openings, pocket support, and kinematic rotor contacts.
---

 A procedural roulette bowl should end at a deliberate pocket aperture, while the pocket floor must provide continuous support beneath the full capture area. Rounded, shared boundary frets can pass a direct pocket drop yet still eject or tunnel a launched ball when carried by a rotating kinematic body, so short smoke runs must check real settling and escape independently.

**Why:** A shared mesh/collider scale can still fail at the transition between the bowl and pocket geometry; a zero-drop pass does not prove a launched ball can enter, remain in, and settle in a pocket. Direct pocket drops can pass while moving-fret contacts still create extreme outgoing velocity.

**How to apply:** Validate the bowl aperture first, then run only a small number of varied launches and record outer laps, inward transition, rotor contact, final pocket, maximum speed, and escape/tunneling flags before accepting the design.