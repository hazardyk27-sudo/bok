import { mountRoulette as mountRouletteRuntime } from "./rouletteRuntime";
import { installRouletteBetVerificationUi } from "./verificationController";
import { installRouletteChipFeedbackV2 } from "./chipFeedbackV2";
import { installRouletteChipVisuals } from "./chipVisual";
import "./verification.css";
import "./chipFeedback.css";
import "./chipVisual.css";

export function mountRoulette(app: HTMLDivElement) {
  mountRouletteRuntime(app);
  installRouletteBetVerificationUi(app);
  installRouletteChipFeedbackV2(app);
  installRouletteChipVisuals(app);
}
