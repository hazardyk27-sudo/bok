import { mountRoulette as mountRouletteRuntime } from "./rouletteRuntime";
import { installRouletteBetVerificationUi } from "./verificationController";
import { installRouletteChipFeedbackV2 } from "./chipFeedbackV2";
import { installRouletteChipVisuals } from "./chipVisual";
import { installRouletteBetAuthority } from "./betAuthority";
import { installRouletteFastDouble } from "./fastDouble";
import { installRouletteLatestMutationDeduper } from "./latestMutationDeduper";
import { installRouletteChipDragV6 } from "./chipDragV6";
import { installRouletteAuthorityBetDomGuard } from "./authorityBetDom";
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
  // stale polling/retries.
  installRouletteBetAuthority(app);

  // A fast deadline-sensitive mutation may already own the exact plan the
  // runtime is about to submit. Reuse that promise instead of issuing a second
  // HTTP write for the same user action.
  installRouletteLatestMutationDeduper();

  // rouletteRuntime owns the table lifecycle, but every placed-chip DOM node is
  // created through createRouletteCanonicalPlacedChip. The runtime must never
  // restore legacy chip-* classes or --chip-* palette variables.
  mountRouletteRuntime(app);
  installRouletteBetVerificationUi(app);
  installRouletteChipFeedbackV2(app);

  // One physical casino-chip face is shared by tray, mobile picker, table and
  // drag. Aggregate table amounts only change the printed value/tier.
  installRouletteChipVisuals(app);

  // During betting, authority topology also owns the placed-chip DOM. If an old
  // runtime/poll render attempts to repaint a stale source cell, reconciliation
  // occurs in the same microtask before that stale topology reaches paint.
  installRouletteAuthorityBetDomGuard(app);

  // x2 stamps its one network request at click time. The runtime still performs
  // the normal optimistic reducer/render, but its matching updateGlobalBet call
  // shares the already-started request through the deduper above.
  installRouletteFastDouble(app);

  // Drag updates canonical authority at pointer-up and starts its write
  // immediately; the short snap duration is visual only.
  installRouletteChipDragV6(app);
}
