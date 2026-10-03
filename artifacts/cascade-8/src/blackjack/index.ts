import "./blackjack.css";
import {
  connectBlackjackRealtimeElement as connectBlackjackRealtimeElementLocal,
  type BlackjackBrowserRealtimeConnection,
  type BlackjackBrowserRealtimeOptions,
} from "./browserRealtime";
import {
  BLACKJACK_DEFAULT_TABLE_VIEW,
  BLACKJACK_TABLE_SEAT_NUMBERS,
  renderBlackjackTableShell,
  type BlackjackTableViewModel,
} from "./tableView";

export const BLACKJACK_ROUTE = "/blackjack";
export const BLACKJACK_MAX_SEATS = 5;

export const BLACKJACK_SHELL_MARKUP = renderBlackjackTableShell(
  BLACKJACK_DEFAULT_TABLE_VIEW,
);

export function mountBlackjack(
  app: HTMLElement,
  model: BlackjackTableViewModel = BLACKJACK_DEFAULT_TABLE_VIEW,
) {
  app.innerHTML = renderBlackjackTableShell(model);
}

export function mountBlackjackSessionUnavailable(
  app: HTMLElement,
  onRetry: () => void,
): void {
  mountBlackjack(app, {
    ...BLACKJACK_DEFAULT_TABLE_VIEW,
    phaseLabel: "CONNECTION ERROR",
    balanceLabel: "—",
    turnLabel: "SESSION UNAVAILABLE",
    interactionMode: "WAIT",
    interactionPrompt: "TABLE SESSION UNAVAILABLE",
    actionStatusLabel: "CHECK CONNECTION AND RETRY",
    actionStatusTone: "error",
    connectionStatus: Object.freeze({
      label: "ERROR",
      tone: "error" as const,
    }),
  });

  const context = app.querySelector<HTMLElement>(
    ".blackjack-context-strip",
  );
  if (!context) return;

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "blackjack-session-retry";
  retry.dataset.blackjackSessionRetry = "true";
  retry.textContent = "RETRY";
  retry.addEventListener("click", onRetry, { once: true });
  context.append(retry);
}

export function mountConnectedBlackjack(
  app: HTMLElement,
  options: BlackjackBrowserRealtimeOptions = {},
): BlackjackBrowserRealtimeConnection {
  const hasMountedTable =
    typeof app.querySelector === "function" &&
    app.querySelector('[data-game="blackjack"]') !== null;
  if (!hasMountedTable) {
    mountBlackjack(app);
  }
  return connectBlackjackRealtimeElementLocal(app,options);
}

export {
  BLACKJACK_DEFAULT_TABLE_VIEW,
  BLACKJACK_TABLE_SEAT_NUMBERS,
  renderBlackjackTableShell,
};
export type { BlackjackTableViewModel };

export {
  BLACKJACK_BASE_CHIP_DENOMINATIONS,
  BLACKJACK_DEFAULT_BETTING_PANEL,
  BLACKJACK_HIGH_CHIP_BASE_CREDITS,
  doubleBlackjackChipCredits,
  formatBlackjackChipCredits,
  getBlackjackHighChipCredits,
  isBlackjackChipDenomination,
  renderBlackjackBettingPanel,
} from "./bettingView";
export type { BlackjackBettingPanelViewModel } from "./bettingView";

export {
  buildBlackjackTableViewModelFromSnapshot,
  getBlackjackVisibleCardTotal,
} from "./snapshotView";
export type {
  BlackjackPublicSnapshotViewSource,
  BlackjackSnapshotViewContext,
} from "./snapshotView";

export {
  bindBlackjackRealtimeElement,
  bindBlackjackRealtimeView,
} from "./realtimeClient";
export type {
  BlackjackRealtimeCursor,
  BlackjackRealtimeSocketLike,
  BlackjackRealtimeViewBindingOptions,
  BlackjackRealtimeViewController,
} from "./realtimeClient";

export {
  BLACKJACK_WEBSOCKET_PATH,
  buildBlackjackWebSocketUrl,
  connectBlackjackRealtimeElement,
} from "./browserRealtime";
export type {
  BlackjackBrowserLocation,
  BlackjackBrowserRealtimeConnection,
  BlackjackBrowserRealtimeOptions,
  BlackjackBrowserSocket,
  BlackjackBrowserSocketFactory,
} from "./browserRealtime";

export {
  BLACKJACK_SESSION_ATTEMPT_TIMEOUT_MS,
  BLACKJACK_SESSION_ENDPOINT,
  BLACKJACK_SESSION_MAX_ATTEMPTS,
  BLACKJACK_SESSION_RETRY_DELAY_MS,
  BlackjackSessionBootstrapError,
  waitForBlackjackSession,
} from "./sessionBootstrap";
export type { BlackjackSessionBootstrapOptions } from "./sessionBootstrap";

export {
  BLACKJACK_PLAYER_ACTION_TYPES,
  buildBlackjackPlayerActionMessage,
  createBlackjackPlayerActionClient,
  getBlackjackAvailablePlayerActions,
} from "./playerActionsClient";
export type {
  BlackjackPendingPlayerAction,
  BlackjackPlayerActionClient,
  BlackjackPlayerActionFeedback,
  BlackjackPlayerActionMessage,
  BlackjackPlayerActionType,
} from "./playerActionsClient";

export {
  buildBlackjackBettingActionMessage,
  createBlackjackBettingClient,
} from "./bettingClient";
export type {
  BlackjackBettingActionMessage,
  BlackjackBettingActionType,
  BlackjackBettingClient,
  BlackjackBettingFeedback,
  BlackjackBettingState,
  BlackjackPendingBettingAction,
} from "./bettingClient";

export { createBlackjackPrivatePlayerStateClient } from "./privateStateClient";
export type {
  BlackjackPrivatePlayerStateClient,
  BlackjackPrivatePlayerStateView,
} from "./privateStateClient";

export { createBlackjackSeatCommandClient } from "./seatClient";
export type {
  BlackjackSeatCommandClient,
  BlackjackSeatCommandPending,
} from "./seatClient";
