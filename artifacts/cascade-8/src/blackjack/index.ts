import "./blackjack.css";
import {
  connectBlackjackRealtimeElement as connectBlackjackRealtimeElementLocal,
  type BlackjackBrowserRealtimeConnection,
  type BlackjackBrowserRealtimeOptions,
} from "./browserRealtime";
import { repairBlackjackSessionIdentity } from "./sessionBootstrap";
import {
  BLACKJACK_DEFAULT_TABLE_VIEW,
  BLACKJACK_TABLE_SEAT_NUMBERS,
  renderBlackjackTableShell,
  type BlackjackTableViewModel,
} from "./tableView";

export const BLACKJACK_ROUTE = "/blackjack";
export const BLACKJACK_MAX_SEATS = 5;
export const BLACKJACK_MOUNT_SNAPSHOT_TIMEOUT_MS = 15_000;
export const BLACKJACK_INITIAL_CONNECTION_DEADLINE_MS = 25_000;
export const BLACKJACK_TERMINAL_REPAIR_POLL_MS = 250;
const BLACKJACK_AUTO_REPAIR_MARKER = "blackjack-realtime-auto-repair-v1";

export const BLACKJACK_SHELL_MARKUP = renderBlackjackTableShell(
  BLACKJACK_DEFAULT_TABLE_VIEW,
);

export function mountBlackjack(
  app: HTMLElement,
  model: BlackjackTableViewModel = BLACKJACK_DEFAULT_TABLE_VIEW,
) {
  app.innerHTML = renderBlackjackTableShell(model);
}

function appendBlackjackRetry(
  app: HTMLElement,
  onRetry: () => void,
): void {
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

function hasBlackjackAutoRepairMarker(): boolean {
  try {
    return window.sessionStorage.getItem(BLACKJACK_AUTO_REPAIR_MARKER) === "1";
  } catch {
    return false;
  }
}

function markBlackjackAutoRepairAttempted(): void {
  try {
    window.sessionStorage.setItem(BLACKJACK_AUTO_REPAIR_MARKER, "1");
  } catch {
    // Hardened/private browser contexts can block sessionStorage.
  }
}

function clearBlackjackAutoRepairMarker(): void {
  try {
    window.sessionStorage.removeItem(BLACKJACK_AUTO_REPAIR_MARKER);
  } catch {
    // Hardened/private browser contexts can block sessionStorage.
  }
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
  appendBlackjackRetry(app, onRetry);
}

export function mountBlackjackConnectionUnavailable(
  app: HTMLElement,
  onRetry: () => void,
): void {
  mountBlackjack(app, {
    ...BLACKJACK_DEFAULT_TABLE_VIEW,
    phaseLabel: "CONNECTION ERROR",
    balanceLabel: "—",
    turnLabel: "REALTIME UNAVAILABLE",
    interactionMode: "WAIT",
    interactionPrompt: "TABLE CONNECTION UNAVAILABLE",
    actionStatusLabel: "RETRY TABLE CONNECTION",
    actionStatusTone: "error",
    connectionStatus: Object.freeze({
      label: "ERROR",
      tone: "error" as const,
    }),
  });
  appendBlackjackRetry(app, onRetry);
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

  const connection = connectBlackjackRealtimeElementLocal(app, {
    ...options,
    snapshotTimeoutMs:
      options.snapshotTimeoutMs ?? BLACKJACK_MOUNT_SNAPSHOT_TIMEOUT_MS,
  });

  if (typeof window === "undefined") {
    return connection;
  }

  let guardActive = true;
  let repairInFlight = false;
  let initialConnectionDeadline: number | null = null;
  let terminalStatePoll: number | null = null;

  const clearInitialGuards = (): void => {
    if (initialConnectionDeadline !== null) {
      window.clearTimeout(initialConnectionDeadline);
      initialConnectionDeadline = null;
    }
    if (terminalStatePoll !== null) {
      window.clearInterval(terminalStatePoll);
      terminalStatePoll = null;
    }
  };

  const mountTerminalFailure = (): void => {
    guardActive = false;
    clearInitialGuards();
    connection.close();
    mountBlackjackConnectionUnavailable(app, () => {
      clearBlackjackAutoRepairMarker();
      window.location.reload();
    });
  };

  const attemptSessionRepair = (): void => {
    if (!guardActive || repairInFlight) return;

    if (hasBlackjackAutoRepairMarker()) {
      mountTerminalFailure();
      return;
    }

    repairInFlight = true;
    markBlackjackAutoRepairAttempted();
    guardActive = false;
    clearInitialGuards();
    connection.close();

    void repairBlackjackSessionIdentity()
      .then(() => {
        if (!document.body.contains(app)) return;
        window.location.reload();
      })
      .catch(() => {
        if (!document.body.contains(app)) return;
        mountBlackjackConnectionUnavailable(app, () => {
          clearBlackjackAutoRepairMarker();
          window.location.reload();
        });
      });
  };

  terminalStatePoll = window.setInterval(() => {
    if (!guardActive) return;

    if (connection.controller.getCursor() !== null) {
      clearBlackjackAutoRepairMarker();
      guardActive = false;
      clearInitialGuards();
      return;
    }

    if (connection.getStatus().state === "ERROR") {
      attemptSessionRepair();
    }
  }, BLACKJACK_TERMINAL_REPAIR_POLL_MS);

  initialConnectionDeadline = window.setTimeout(() => {
    if (!guardActive) return;
    if (connection.controller.getCursor() !== null) {
      clearBlackjackAutoRepairMarker();
      guardActive = false;
      clearInitialGuards();
      return;
    }

    const state = connection.getStatus().state;
    if (state === "ERROR") {
      attemptSessionRepair();
      return;
    }
    if (
      state === "CLOSED" ||
      state === "SESSION_REPLACED"
    ) {
      return;
    }

    mountTerminalFailure();
  }, BLACKJACK_INITIAL_CONNECTION_DEADLINE_MS);

  return Object.freeze({
    ...connection,
    close: () => {
      if (guardActive) {
        guardActive = false;
        clearInitialGuards();
      }
      connection.close();
    },
  });
}

export {
  BLACKJACK_DEFAULT_TABLE_VIEW,
  BLACKJACK_TABLE_SEAT_NUMBERS,
  renderBlackjackTableShell,
};
export type { BlackjackTableViewModel } from "./tableView";

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
  BLACKJACK_AUTH_ME_ENDPOINT,
  BLACKJACK_SESSION_ATTEMPT_TIMEOUT_MS,
  BLACKJACK_SESSION_ENDPOINT,
  BLACKJACK_SESSION_MAX_ATTEMPTS,
  BLACKJACK_SESSION_REPAIR_AUTH_TIMEOUT_MS,
  BLACKJACK_SESSION_RETRY_DELAY_MS,
  BlackjackSessionBootstrapError,
  repairBlackjackSessionIdentity,
  waitForBlackjackSession,
} from "./sessionBootstrap";
export type {
  BlackjackSessionBootstrapOptions,
  BlackjackSessionRepairOptions,
} from "./sessionBootstrap";

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
