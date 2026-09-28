import { createBlackjackPlayerActionClient, type BlackjackPlayerActionClient, type BlackjackPlayerActionType } from "./playerActionsClient";
import {
  bindBlackjackRealtimeElement,
  type BlackjackRealtimeSocketLike,
  type BlackjackRealtimeViewController,
} from "./realtimeClient";
import type { BlackjackSnapshotViewContext } from "./snapshotView";

export const BLACKJACK_WEBSOCKET_PATH = "/api/blackjack/ws" as const;

export type BlackjackBrowserLocation = Readonly<{
  protocol: string;
  host: string;
}>;

export type BlackjackBrowserSocket = BlackjackRealtimeSocketLike &
  Readonly<{
    close: (code?: number, reason?: string) => void;
  }>;

export type BlackjackBrowserSocketFactory = (
  url: string,
) => BlackjackBrowserSocket;

export type BlackjackBrowserRealtimeOptions = Readonly<{
  location?: BlackjackBrowserLocation;
  createSocket?: BlackjackBrowserSocketFactory;
  getViewContext?: () => BlackjackSnapshotViewContext;
  createActionId?: () => string;
}>;

export type BlackjackBrowserRealtimeConnection = Readonly<{
  url: string;
  socket: BlackjackBrowserSocket;
  controller: BlackjackRealtimeViewController;
  actions: BlackjackPlayerActionClient;
  close: () => void;
}>;

export function buildBlackjackWebSocketUrl(
  location: BlackjackBrowserLocation,
): string {
  const protocol =
    location.protocol === "https:"
      ? "wss:"
      : location.protocol === "http:"
        ? "ws:"
        : null;

  if (protocol === null) {
    throw new Error(
      "Blackjack realtime requires an http: or https: page origin",
    );
  }
  if (!location.host.trim()) {
    throw new Error("Blackjack realtime requires a non-empty page host");
  }

  return protocol + "//" + location.host + BLACKJACK_WEBSOCKET_PATH;
}

function defaultBlackjackSocketFactory(url: string): BlackjackBrowserSocket {
  return new WebSocket(url) as unknown as BlackjackBrowserSocket;
}

function defaultBlackjackActionId(): string {
  if (
    typeof globalThis.crypto === "undefined" ||
    typeof globalThis.crypto.randomUUID !== "function"
  ) {
    throw new Error("Blackjack actionId generator is unavailable");
  }
  return globalThis.crypto.randomUUID();
}

function readPlayerAction(target: EventTarget | null): BlackjackPlayerActionType | null {
  if (!(target instanceof Element)) return null;
  const button=target.closest<HTMLButtonElement>("[data-blackjack-action]");
  if (!button || button.disabled) return null;
  const action=button.dataset.blackjackAction;
  return action === "HIT" ||
    action === "STAND" ||
    action === "DOUBLE" ||
    action === "SPLIT"
    ? action
    : null;
}

export function connectBlackjackRealtimeElement(
  app: HTMLElement,
  options: BlackjackBrowserRealtimeOptions = {},
): BlackjackBrowserRealtimeConnection {
  const location =
    options.location ??
    (typeof window === "undefined" ? null : window.location);

  if (location === null) {
    throw new Error(
      "Blackjack realtime browser location is unavailable",
    );
  }

  const url=buildBlackjackWebSocketUrl(location);
  const socket=(options.createSocket ?? defaultBlackjackSocketFactory)(url);
  const getViewContext=options.getViewContext ?? (() => ({}));
  const controller=bindBlackjackRealtimeElement(
    app,
    socket,
    getViewContext,
  );
  const actions=createBlackjackPlayerActionClient({
    socket,
    getSnapshot:controller.getSnapshot,
    getViewContext,
    createActionId:options.createActionId ?? defaultBlackjackActionId,
  });
  const onClick=(event: Event) => {
    const action=readPlayerAction(event.target);
    if(action===null) return;
    try {
      actions.submit(action);
    } catch {
      return;
    }
  };
  app.addEventListener("click",onClick);
  let closed=false;

  return Object.freeze({
    url,
    socket,
    controller,
    actions,
    close:()=>{
      if(closed) return;
      closed=true;
      app.removeEventListener("click",onClick);
      controller.detach();
      socket.close(1000,"BLACKJACK_CLIENT_CLOSED");
    },
  });
}
