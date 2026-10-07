import { mountRoulette as mountRouletteRuntime } from "./rouletteRuntime";
import { installRouletteBetVerificationUi } from "./verificationController";
import { installRouletteChipFeedbackV2 } from "./chipFeedbackV2";
import { installRouletteChipVisuals } from "./chipVisual";
import { installRouletteBetAuthority } from "./betAuthority";
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

  // One state authority owns wager topology and serializes every server write.
  // It never renders DOM; runtime is the only persistent chip renderer.
  installRouletteBetAuthority(app);

  mountRouletteRuntime(app);
  installRouletteBetVerificationUi(app);
  installRouletteChipFeedbackV2(app);
  installRouletteChipVisuals(app);

  // Drag is input-only: one optimistic render at drop, then one serialized
  // authority write. No polling loop, DOM protector, or secondary writer.
  installRouletteChipDragV6(app);
}
