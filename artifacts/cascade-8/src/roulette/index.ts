import { mountRoulette as mountRouletteRuntime } from "./rouletteRuntime";
import { installRouletteBetVerificationUi } from "./verificationController";
import { installRouletteChipFeedbackV2 } from "./chipFeedbackV2";
import { installRouletteChipVisuals } from "./chipVisual";
import { installRouletteBetAuthority } from "./betAuthority";
import { installRouletteChipDragLatestWriter } from "./chipDragLatestWriter";
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
  installRouletteNetworkGuard();
  installRouletteIncrementalPlacedChipReuse(app);
  installRouletteOptimisticBalanceBridge();

  // One authority owns the wager topology before runtime creates any wallet
  // clients. Drag changes position only; normal controls mutate this same state.
  installRouletteBetAuthority(app);

  mountRouletteRuntime(app);
  installRouletteOptimisticBalanceUi(app);
  installRouletteBetVerificationUi(app);
  installRouletteChipFeedbackV2(app);
  installRouletteChipVisuals(app);

  // Revision/race compatibility remains around the single authority, but DOM
  // snapshots and the old separate canonical/source-mirror layers no longer own
  // wager state or chip color.
  installRouletteChipDragLatestWriter(app);
  installRouletteChipDragV6(app);
}
