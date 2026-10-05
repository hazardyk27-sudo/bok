import { mountRoulette as mountRouletteRuntime } from "./rouletteRuntime";
import { installRouletteBetVerificationUi } from "./verificationController";
import { installRouletteChipFeedbackV2 } from "./chipFeedbackV2";
import { installRouletteChipVisuals } from "./chipVisual";
import { installRouletteChipDragLatestWriter } from "./chipDragLatestWriter";
import { installRouletteChipDragCanonicalState } from "./chipDragCanonicalState";
import { installRouletteChipDragV6 } from "./chipDragV6";
import { installRouletteNetworkGuard } from "./rouletteNetworkGuard";
import {
  installRouletteOptimisticBalanceBridge,
  installRouletteOptimisticBalanceUi,
} from "./optimisticBalanceUi";
import "./verification.css";
import "./chipFeedback.css";
import "./chipVisual.css";
import "./chipDrag.css";
import "./placedChipLayout.css";
import "./settingsMenu.css";

export function mountRoulette(app: HTMLDivElement) {
  // Install Roulette-only transport bounds before any client instance starts.
  // A timed-out mutation still falls through the existing authoritative state
  // rehydrate path; other games and unrelated fetches remain untouched.
  installRouletteNetworkGuard();

  // Patch the wallet client before rouletteRuntime creates its client instance so
  // the very first authoritative bootstrap can seed the optimistic balance base.
  installRouletteOptimisticBalanceBridge();
  mountRouletteRuntime(app);
  installRouletteOptimisticBalanceUi(app);
  installRouletteBetVerificationUi(app);
  installRouletteChipFeedbackV2(app);
  installRouletteChipVisuals(app);
  installRouletteChipDragLatestWriter(app);
  installRouletteChipDragCanonicalState(app);
  installRouletteChipDragV6(app);
}
