import "./roundResultOverlay.css";
import { mountBlackjackLive as mountBaseBlackjackLive } from "./live";
import { installBlackjackRoundResultOverlay } from "./roundResultOverlay";

export function mountBlackjackLive(app: HTMLDivElement): void {
  const cleanupSummary = installBlackjackRoundResultOverlay(app);
  mountBaseBlackjackLive(app);
  window.addEventListener("pagehide", cleanupSummary, { once: true });
}
