---
name: Physics Lab main-world pocket transition
description: Main-world Rapier pocket descent requires an open outer-track edge, rotor-phase alignment, and a supported floor underlay.
---

The Part 3 pocket transition must be measured in the main Rapier world: the old inner closing wall of the outer-track trimesh can be the first blocker even when isolated pocket-entry tests pass. Keep the transition edge open, align the probe to the live rotor phase, and retain a thin catch underlay below the continuous pocket floor so kinematic fret contact cannot tunnel the ball below the measured surface.

**Why:** A closed analytic track profile blocked the aperture at the outer-track handle before any pocket collider could contact. Removing the wall alone exposed an edge/tunneling failure under moving-fret contact; the underlay preserves the validated floor support without restoring the blocking wall.

**How to apply:** Instrument contact handles before geometry edits, preserve the 37 synchronized fret colliders and European mapping, compute settling in rotor-relative velocity, and report the measured pre-fix blocker separately from the post-fix pocket contacts.

The normalized visual GLB and the analytic outer-track profile can also disagree vertically even when wheel scale, center, and ball/body synchronization are correct. Measure the visible upper surface with a world-space raycast at the ball’s live radius/azimuth, then correct the physics profile by that measured surface difference; do not lift only the rendered sphere.

**Why:** The alignment probe found a physical contact at the analytic profile while the ball bottom was materially below `geo1_outside_0`’s visible upper surface. The ball was synchronized to Rapier, so changing render depth or visual position would have hidden the collider error rather than fixing it.

**How to apply:** Report visible surface Y, pre/post collider Y, ball bottom Y, signed visual mismatch, and real contact separately; require a short direct-body probe to show no visual embedding, hover, pass-through, tunneling, or sync error.