import { mountRoulette as mountRouletteRuntime } from "./rouletteRuntime";
import { installRouletteBetVerificationUi } from "./verificationController";
import "./verification.css";

export function mountRoulette(app: HTMLDivElement) {
  mountRouletteRuntime(app);
  installRouletteBetVerificationUi(app);
}
