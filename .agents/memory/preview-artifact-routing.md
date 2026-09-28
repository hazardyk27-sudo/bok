---
name: Preview artifact routing
description: Why a working root Vite server may still be unreachable from Replit Preview
---

Replit Preview requires a registered web artifact and its managed workflow; a manually configured root workflow can serve localhost successfully while the external preview domain returns 404.

**Why:** The proxy routes registered artifact services, not arbitrary root processes. A root app without an artifact manifest may appear healthy in workflow logs but has no external preview route.

**How to apply:** For future standalone web apps, create or migrate to a `react-vite` artifact with `previewPath = "/"`, then use the exact managed `artifacts/<slug>: web` workflow and present the artifact.