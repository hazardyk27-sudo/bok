# Idle / İşletmeler ownership

This directory is the complete Idle / İşletmeler frontend ownership root.

Idle work may modify this directory, `artifacts/cascade-8/public/businesses/**`, and the Idle API root declared in `.github/game-ownership.json`.

Idle work must not modify Slot, Roulette, Cadı Kazan, Hub, or shared/platform files during a normal game update.

The Businesses route shell, route body state, CSS reset/foundation, UI, components, services and tests live here. Do not rely on Slot/Hub `styles.css` for layout or reset behavior.

An Idle commit never publishes itself to Replit; only the central one-game promotion workflow may update the Idle slice of `integration/replit-preview`.
