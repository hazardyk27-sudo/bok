import "./roundResultOverlay.css";
import "./tableRulesUi.css";
import { mountBlackjackLive as mountBaseBlackjackLive } from "./live";
import { installBlackjackRoundResultOverlay } from "./roundResultOverlay";
import { installBlackjackTableRulesUi } from "./tableRulesUi";

export function mountBlackjackLive(app: HTMLDivElement): void {
  const cleanupSummary = installBlackjackRoundResultOverlay(app);
  const cleanupRules = installBlackjackTableRulesUi(app);
  mountBaseBlackjackLive(app);

  window.addEventListener("pagehide", () => {
    cleanupSummary();
    cleanupRules();
  }, { once: true });
}
