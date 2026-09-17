---
name: Physics Lab runtime verification
description: Physics Lab GLB assets and WebGL acceptance checks have environment-specific routing and browser constraints.
---

Keep binary assets at the artifact public root when the Vite base path is already part of the requested URL; nesting the same base path under public can return the HTML fallback with status 200 instead of GLB bytes.

**Why:** The preview proxy can serve a fallback document for a misrouted binary request, and its screenshot browser may not create a WebGL context even when direct Chromium can load the scene.

When reparenting a cloned GLTF scene, measure its post-parent world bounds and apply a corrective offset before accepting the normalized pivot; cloned child world matrices can retain stale state across the new parent boundary.

**How to apply:** Verify the GLB response content type and magic bytes, then run a direct Chromium check with SwiftShader for `Source loaded`, exact pivot, view controls, Rapier collider initialization, and temporary probe results; keep a user-visible WebGL error state for browsers that cannot initialize the renderer.