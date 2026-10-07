import { mountRoulette as mountRouletteRuntime } from "./rouletteRuntime";
import { installRouletteBetVerificationUi } from "./verificationController";
import { installRouletteChipFeedbackV2 } from "./chipFeedbackV2";
import { installRouletteChipVisuals } from "./chipVisual";
import { installRouletteBetAuthority } from "./betAuthority";
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
  installRouletteNetworkGuard();
  installRouletteOptimisticBalanceBridge();

  // Transitional single-state rebuild: authority is now only a network/revision
  // guard. It no longer renders chips or observes DOM mutations.
  installRouletteBetAuthority(app);

  mountRouletteRuntime(app);
  installRouletteOptimisticBalanceUi(app);
  installRouletteBetVerificationUi(app);
  installRouletteChipFeedbackV2(app);
  installRouletteChipVisuals(app);

  // V6 remains temporarily as the input gesture layer. The old latest-writer
  // and Element.prototype reuse hooks are intentionally not mounted because
  // they created competing DOM/state ownership and microtask churn.
  installRouletteChipDragV6(app);
}
