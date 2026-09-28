---
name: Packet stack RTP calibration
description: Why correlated stack packets require full-spin calibration and packet-size tuning.
---

When adding correlated 1x2 normal-symbol packets, calibrate RTP from complete seeded spin simulations, including tumbles, Free Spins, Cores, and settlement. A packet mix that looks modest at the stream level can materially amplify symbol counts and multiplicative wins.

**Why:** Cell-level payout evaluation makes two matching members more valuable than two independent cells, and persistent continuation carries that correlation across refill turns.

**How to apply:** Keep packet metadata and atomic stream behavior intact. If RTP rises, adjust only the single/double packet probability, and report configured versus observed packet mix plus initial-board and refill stack frequencies.