# Cadı Kazan ownership

This directory is the Cadı Kazan frontend ownership root.

Cadı Kazan work may modify this directory and the Cadı Kazan API root declared in `.github/game-ownership.json`.

Cadı Kazan work must not modify Slot, Roulette, Idle, Hub, or shared/platform files during a normal game update.

The scratch system, styles, route mount, client, and Cadı-specific audio runtime are owned here. A Cadı Kazan commit does not publish itself to Replit; only the central one-game promotion workflow may update the Cadı Kazan slice of `integration/replit-preview`.
