---
name: Physics Lab Part 3 outer-track and deflector validation
description: Measured outer-lane and deflector probe constraints for roulette physics validation.
---

The visible Part 3 deflector band needs a radial ring of simple oriented cuboids, not a single broad rim collider. A controlled approach must start outside the deflector’s outer face with the ball radius included in the clearance calculation; overlapping the old analytic inner wall produces artificial solver impulses that look like tunneling or velocity explosions.

**Why:** The visual obstacle band is separate from the dark running surface, and a collider that overlaps both can report contact while physically reacting to the wrong surface.

**How to apply:** Keep the outer launch lane outside the measured deflector band, require positive ball-surface clearance and several continuous laps for the clearance probe, and use a separate inward approach to require actual deflector contact, a bounded post-impact speed, and a meaningful direction change.