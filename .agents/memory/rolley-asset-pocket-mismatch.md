---
name: Rolley asset pocket mismatch
description: Audit result for the supplied Rolley FBX radial pocket/separator geometry.
---

The supplied Rolley FBX contains 38 equally spaced radial separator meshes in the pocket band: one `Cube_4` plus `Cube_instance_19` through `Cube_instance_55`, with approximately 9.473684 degrees between centers. The set has 38 distinct angular positions; it is not a duplicated seam at one angle.

**Why:** The Physics Lab preserves a 37-pocket European single-zero result sequence, so mapping this source as if it were European would create an off-by-one pocket/result mismatch and could silently imply an American-style layout.

**How to apply:** Do not map these radial separators to the existing 37-pocket sequence or integrate the asset as the playable wheel until a source revision proves a 37-pocket geometry. The FBX references `number.png`, but that number texture was not among the supplied files; `Metal+6.tif` is a separate metal material texture.