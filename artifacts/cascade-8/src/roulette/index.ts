import { mountRoulette as mountRouletteRuntime } from "./rouletteRuntime";
import { installRouletteBetVerificationUi } from "./verificationController";
import { installRouletteChipFeedback } from "./chipFeedback";
import "./verification.css";
import "./chipFeedback.css";

export function mountRoulette(app: HTMLDivElement) {
  mountRouletteRuntime(app);
  installRouletteBetVerificationUi(app);
  installRouletteChipFeedback(app);
}
