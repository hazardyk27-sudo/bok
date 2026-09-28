---
name: Mobile browser matrix
description: Environment constraints and execution guidance for roulette mobile-browser recovery coverage.
---

Use the Android Chrome mobile profile as the always-on browser check when the workspace Chromium binary is available. Keep the iOS Safari/WebKit profile opt-in until the runner supplies WebKit's native multimedia, graphics, and GTK libraries.

**Why:** The development container includes a working Chromium binary but the Playwright WebKit bundle can be present while still failing at launch because the minimal host image lacks its native shared libraries.

**How to apply:** Gate WebKit with an explicit environment flag, retain lifecycle diagnostics and traces on failure, and treat a missing WebKit host dependency as an environment/setup result rather than a roulette assertion failure.