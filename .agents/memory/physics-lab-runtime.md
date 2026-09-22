---
name: Physics Lab runtime verification
description: Physics Lab GLB assets and WebGL acceptance checks have environment-specific routing and browser constraints.
---

Keep binary assets at the artifact public root when the Vite base path is already part of the requested URL; nesting the same base path under public can return the HTML fallback with status 200 instead of GLB bytes.

**Why:** The preview proxy can serve a fallback document for a misrouted binary request, and its screenshot browser may not create a WebGL context even when direct Chromium can load the scene.

When reparenting a cloned GLTF scene, measure its post-parent world bounds and apply a corrective offset before accepting the normalized pivot; cloned child world matrices can retain stale state across the new parent boundary.

The lab keeps a procedural viewport as rollback code, but the GLB is not active until the main render path mounts the asset-backed SceneViewport; loading the asset in an unused component is insufficient.

**How to apply:** Verify the GLB response content type and magic bytes, then run a direct Chromium check with SwiftShader for `Source loaded`, exact pivot, view controls, Rapier collider initialization, and temporary probe results; keep a user-visible WebGL error state for browsers that cannot initialize the renderer. For multi-probe runs, allow more than the nominal physics duration because headless rendering can make fixed-step validation take longer than wall-clock time.

The preview screenshot path may successfully load the GLB and show the audit while its WebGL canvas stays blank; same-world validation reports must remain visible without relying on rendered pixels.

**Why:** The proxied browser can lack a WebGL context even when the Rapier setup and asset audit complete, so a blank canvas alone is not evidence that physics initialization failed.

**How to apply:** Keep validation status and probe details in an explicit DOM report overlay, and treat WebGL availability as a separate visual capability from physics validation.

For the outer-race task, a numeric Rapier placement/contact result is never sufficient for PASS: the static gate must also have a live renderer and a screenshot-visible ball inside the recessed dark channel; otherwise it must fail and stop before tangential or lap probes.

**Why:** A blank WebGL canvas can make an upper-surface or otherwise incorrect placement appear numerically valid while the required visual acceptance cannot be inspected.

**How to apply:** Keep the analytic channel collider and physics report available, but require renderer-backed visual evidence before starting any follow-on outer-track probe or lap tuning.

For sloped GLB-backed side-track contact, place the ball from the sampled triangle point along its transformed world-space normal by one ball radius plus a small measured tolerance; evaluate side-track penetration against that same local contact plane, not only the old vertical Y sample.

**Why:** A vertical-only spawn and Y penetration metric can report false clipping when the true surface normal shifts the ball center in X/Z; the normal-based placement reduced the side-track guard from 0.0327 to 0.0006 without changing the 0.03 acceptance limit.

**How to apply:** Preserve the single authoritative world and direct mesh/body sync, expose the sample point/normal/center in the report, and include penetration and rotor-sync guards in the aggregate PART 1 status.