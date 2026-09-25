---
name: Physics Lab server authority
description: Constraints for deterministic server-owned roulette physics rounds and replay payloads.
---

The server must keep the validated Part 5 release band while randomizing the allowed initial conditions; arbitrary launch azimuths are not equivalent because the segmented collider geometry is not perfectly rotationally symmetric.

**Why:** Randomizing the release sector caused valid-looking Rapier rounds to fail before the inward transition, while secure variation inside the accepted sector continued to settle naturally.

**How to apply:** Keep client result calculation isolated from official round generation, validate every server state, and derive canonical API responses from the persisted PostgreSQL row after insertion so POST and replay payloads stay byte-equivalent.