import { mountRoulette as mountRouletteRuntime } from "./rouletteRuntime";
import { installRouletteBetVerificationUi } from "./verificationController";
import { installRouletteChipFeedbackV2 } from "./chipFeedbackV2";
import { installRouletteChipVisuals } from "./chipVisual";
import { installRouletteBetAuthority } from "./betAuthority";
import { installRouletteFastDouble } from "./fastDouble";
import { installRouletteChipDragV6 } from "./chipDragV6";
import { installRouletteNetworkGuard } from "./rouletteNetworkGuard";
import "./verification.css";
import "./chipFeedback.css";
import "./chipVisual.css";
import "./chipDrag.css";
import "./placedChipLayout.css";
import "./settingsMenu.css";

export function mountRoulette(app: HTMLDivElement) {
  installRouletteNetworkGuard();

  // One state authority owns wager topology and protects optimistic state from
  // stale polling/retries. Runtime remains the persistent chip renderer.
  installRouletteBetAuthority(app);

  mountRouletteRuntime(app);
  installRouletteBetVerificationUi(app);
  installRouletteChipFeedbackV2(app);

  // Placed-chip color follows the aggregate wager tier. Example: 10/20/40 are
  // white, 80 is blue, 160 is green. Do not overwrite this with the selected
  // tray chip's original color.
  installRouletteChipVisuals(app);

  // x2 gets a parallel server-stamped latest-state write so a click made while
  // BET TIME is open is not lost behind an older client-side wager request.
  installRouletteFastDouble(app);

  // Drag is input-only: one optimistic render at drop, then one serialized
  // authority write. No polling loop, DOM protector, or secondary drag writer.
  installRouletteChipDragV6(app);
}
