import { mountRoulette as mountRouletteRuntime } from "./rouletteRuntime";
import { installRouletteBetVerificationUi } from "./verificationController";
import { installRouletteChipFeedbackV2 } from "./chipFeedbackV2";
import { installRouletteChipVisuals } from "./chipVisual";
import { installRouletteChipDragV2 } from "./chipDragV2";
import { installRouletteChipDragHandoff } from "./chipDragHandoff";
import "./verification.css";
import "./chipFeedback.css";
import "./chipVisual.css";
import "./chipDrag.css";
import "./chipDragHandoff.css";
import "./placedChipLayout.css";

export function mountRoulette(app: HTMLDivElement) {
  mountRouletteRuntime(app);
  installRouletteBetVerificationUi(app);
  installRouletteChipFeedbackV2(app);
  installRouletteChipVisuals(app);
  installRouletteChipDragV2(app);
  installRouletteChipDragHandoff(app);
}
