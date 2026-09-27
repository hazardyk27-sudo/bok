---
name: Roulette scheduler single-flight
description: Prevent overlapping asynchronous round ticks from duplicating rounds and taking wallet APIs offline.
---

An interval does not wait for its asynchronous callback to finish. Keep authoritative roulette round transitions single-flight and catch timer callback failures so a unique-sequence collision or transient database error cannot terminate the API process.

**Why:** On 2026-09-27, overlapping round transitions hit a unique sequence constraint and an unhandled rejection stopped the API, making shared wallet endpoints unavailable even though wallet data remained server-persisted.

**How to apply:** Preserve one in-flight round transition and log/recover scheduler failures. After changing round scheduling or creation, verify the API health endpoint and wallet-backed routes remain reachable.