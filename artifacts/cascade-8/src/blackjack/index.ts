import "./blackjack.css";
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
