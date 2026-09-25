---
name: Physics Lab Part 3 outer-track and deflector validation
description: Measured outer-lane and deflector probe constraints for roulette physics validation.
---

The visible Part 3 deflector band needs a radial ring of simple oriented cuboids, not a single broad rim collider. A controlled approach must start outside the deflector’s outer face with the ball radius included in the clearance calculation; overlapping the old analytic inner wall produces artificial solver impulses that look like tunneling or velocity explosions.

**Why:** The visual obstacle band is separate from the dark running surface, and a collider that overlaps both can report contact while physically reacting to the wrong surface.

**How to apply:** Keep the outer launch lane outside the measured deflector band, require positive ball-surface clearance and several continuous laps for the clearance probe, and use a separate inward approach to require actual deflector contact, a bounded post-impact speed, and a meaningful direction change.

For the short outer-lane probe, treat the measured dark-track radius band as the ball-center lane envelope and evaluate ball-radius clearance separately against the retaining rim and deflector. Keep the outer-lane branch mutually exclusive with the legacy full Part 3 probe path.

**Why:** A sphere can remain within the measured running lane while its edge approaches the neighboring boundaries; applying the ball radius a second time to the center-lane limits rejects valid short-lane runs. Running both probe branches advances the same body twice and creates false contacts.

**How to apply:** Gate the full multi-probe and pocket-start logic off during `outerLaneOnly`; report center-radius min/max plus independent rim/deflector clearances, and require those clearances to retain the configured safety margin.