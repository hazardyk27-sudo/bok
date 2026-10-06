import { mountRoulette as mountRouletteRuntime } from "./rouletteRuntime";
import { installRouletteBetVerificationUi } from "./verificationController";
import { installRouletteChipFeedbackV2 } from "./chipFeedbackV2";
import { installRouletteChipVisuals } from "./chipVisual";
import { installRoulettePlacedChipSourceMirror } from "./placedChipSourceMirror";
import { installRouletteChipDragLatestWriter } from "./chipDragLatestWriter";
import { installRouletteChipDragCanonicalState } from "./chipDragCanonicalState";
import { installRouletteChipDragV6 } from "./chipDragV6";
import { installRouletteNetworkGuard } from "./rouletteNetworkGuard";
import { installRouletteIncrementalPlacedChipReuse } from "./incrementalPlacedChipReuse";
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

  // Reuse placed-chip nodes before rouletteRuntime begins rendering. Runtime
  // remains authoritative for bet state, while repeated renders stop tearing
  // down and rebuilding the same chip DOM nodes.
  installRouletteIncrementalPlacedChipReuse(app);

  // Patch the wallet client before rouletteRuntime creates its client instance so
  // the very first authoritative bootstrap can seed the optimistic balance base.
  installRouletteOptimisticBalanceBridge();
  mountRouletteRuntime(app);
  installRouletteOptimisticBalanceUi(app);
  installRouletteBetVerificationUi(app);
  installRouletteChipFeedbackV2(app);
  installRouletteChipVisuals(app);

  // The tray/right-rail chip is the only visual source of truth. Placed chips
  // mirror that live face and only keep table-specific size/position behavior.
  installRoulettePlacedChipSourceMirror(app);

  installRouletteChipDragLatestWriter(app);
  installRouletteChipDragCanonicalState(app);
  installRouletteChipDragV6(app);
}
