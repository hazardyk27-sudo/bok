---
name: Transient result slots
description: Layout rule for optional result and status panels
---

An optional result panel should keep a stable reserved slot even when its content is inactive. Hide the visual content, not the layout reservation, so persistent controls below it do not jump between inactive and active states.

**Why:** The desktop control dock moved upward whenever the tumble result cleared because the panel collapsed from its active height to a minimal empty state.

**How to apply:** Give the result region a fixed or minimum state-independent height, center active content within it, and keep the surrounding dock in a separate stable layout region. Scope this behavior to desktop when mobile intentionally uses a different flow.