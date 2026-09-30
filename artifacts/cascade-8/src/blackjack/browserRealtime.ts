import { createBlackjackBettingClient, type BlackjackBettingClient, type BlackjackBettingActionType } from "./bettingClient";
import { doubleBlackjackChipCredits } from "./bettingView";
import { createBlackjackPlayerActionClient, type BlackjackPlayerActionClient, type BlackjackPlayerActionType } from "./playerActionsClient";
import {
  createBlackjackPrivatePlayerStateClient,
  type BlackjackPrivatePlayerStateClient,
} from "./privateStateClient";
import {
  createBlackjackSeatCommandClient,
  type BlackjackSeatCommandClient,
} from "./seatClient";
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
  nowMs?: () => number;
  renderTickMs?: number;
  scheduleRender?: (
    callback: () => void,
    intervalMs: number,
  ) => unknown;
  cancelRender?: (handle: unknown) => void;
  autoReconnect?: boolean;
  reconnectDelayMs?: number;
  scheduleReconnect?: (
    callback: () => void,
    delayMs: number,
  ) => unknown;
  cancelReconnect?: (handle: unknown) => void;
}>;

export type BlackjackBrowserConnectionState =
  | "CONNECTING"
  | "READY"
  | "RECONNECTING"
  | "SESSION_REPLACED"
  | "CLOSED";

export type BlackjackBrowserConnectionStatus = Readonly<{
  state: BlackjackBrowserConnectionState;
  transportConnected: boolean;
  cursor: ReturnType<BlackjackRealtimeViewController["getCursor"]>;
}>;

export type BlackjackBrowserRealtimeConnection = Readonly<{
  url: string;
  socket: BlackjackBrowserSocket;
  controller: BlackjackRealtimeViewController;
  actions: BlackjackPlayerActionClient;
  betting: BlackjackBettingClient;
  privateState: BlackjackPrivatePlayerStateClient;
  seats: BlackjackSeatCommandClient;
  getStatus: () => BlackjackBrowserConnectionStatus;
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

type BlackjackPhysicalSocket = BlackjackBrowserSocket & Readonly<{
  addEventListener: (
    type: "message" | "open" | "close" | "error",
    listener: (event: Event | MessageEvent<unknown>) => void,
  ) => void;
  removeEventListener: (
    type: "message" | "open" | "close" | "error",
    listener: (event: Event | MessageEvent<unknown>) => void,
  ) => void;
}>;

function parseMessageType(raw: unknown): string | null {
  const value=
    typeof raw==="string"
      ? (()=>{ try { return JSON.parse(raw); } catch { return null; } })()
      : raw;
  return (
    typeof value==="object" &&
    value!==null &&
    "type" in value &&
    typeof (value as {type?:unknown}).type==="string"
  )
    ? (value as {type:string}).type
    : null;
}

function createBlackjackResilientBrowserSocket(
  url: string,
  factory: BlackjackBrowserSocketFactory,
  input: {
    autoReconnect: boolean;
    reconnectDelayMs: number;
    scheduleReconnect: (callback:()=>void,delayMs:number)=>unknown;
    cancelReconnect: (handle:unknown)=>void;
    onTransportReadyChange: (ready:boolean)=>void;
    onSessionReplaced: () => void;
  },
): BlackjackBrowserSocket {
  const messageListeners=new Set<
    (event: MessageEvent<unknown>)=>void
  >();
  let physical: BlackjackPhysicalSocket | null=null;
  let reconnectHandle: unknown | null=null;
  let explicitlyClosed=false;
  let transportReady=false;
  let terminalSessionReplaced=false;
  let generation=0;
  let detachCurrent: (()=>void) | null=null;

  const setReady=(ready:boolean)=>{
    if(transportReady===ready) return;
    transportReady=ready;
    input.onTransportReadyChange(ready);
  };

  const detachPhysical=(
    socket: BlackjackPhysicalSocket,
    handlers: {
      message:(event: Event | MessageEvent<unknown>)=>void;
      open:(event: Event | MessageEvent<unknown>)=>void;
      close:(event: Event | MessageEvent<unknown>)=>void;
      error:(event: Event | MessageEvent<unknown>)=>void;
    },
  )=>{
    socket.removeEventListener("message",handlers.message);
    socket.removeEventListener("open",handlers.open);
    socket.removeEventListener("close",handlers.close);
    socket.removeEventListener("error",handlers.error);
  };

  const connect=()=>{
    if(explicitlyClosed) return;
    const socket=factory(url) as BlackjackPhysicalSocket;
    physical=socket;
    const ownGeneration=++generation;
    setReady(false);

    const handlers={
      message:(event: Event | MessageEvent<unknown>)=>{
        if(ownGeneration!==generation) return;
        const message=event as MessageEvent<unknown>;
        const type=parseMessageType(message.data);
        if(type==="FULL_TABLE_SNAPSHOT"){
          setReady(true);
        } else if(type==="SESSION_REPLACED"){
          terminalSessionReplaced=true;
          setReady(false);
          input.onSessionReplaced();
        }
        for(const listener of messageListeners){
          listener(message);
        }
      },
      open:()=>undefined,
      close:(event: Event | MessageEvent<unknown>)=>{
        if(ownGeneration!==generation) return;
        detachPhysical(socket,handlers);
        if(detachCurrent!==null) detachCurrent=null;
        if(physical===socket) physical=null;
        setReady(false);
        const code=
          "code" in event && typeof event.code==="number"
            ? event.code
            : 0;
        if(code===4001 && !terminalSessionReplaced){
          terminalSessionReplaced=true;
          input.onSessionReplaced();
        }
        if(
          explicitlyClosed ||
          terminalSessionReplaced ||
          !input.autoReconnect
        ){
          return;
        }
        if(reconnectHandle!==null){
          input.cancelReconnect(reconnectHandle);
        }
        reconnectHandle=input.scheduleReconnect(()=>{
          reconnectHandle=null;
          connect();
        },input.reconnectDelayMs);
      },
      error:()=>undefined,
    };

    socket.addEventListener("message",handlers.message);
    socket.addEventListener("open",handlers.open);
    socket.addEventListener("close",handlers.close);
    socket.addEventListener("error",handlers.error);
    detachCurrent=()=>detachPhysical(socket,handlers);
  };

  connect();

  return Object.freeze({
    send:(data:string)=>{
      if(!transportReady || physical===null){
        throw new Error("Blackjack realtime transport is reconnecting");
      }
      physical.send(data);
    },
    addEventListener:(_type:"message",listener)=>{
      messageListeners.add(listener);
    },
    removeEventListener:(_type:"message",listener)=>{
      messageListeners.delete(listener);
    },
    close:(code?:number,reason?:string)=>{
      if(explicitlyClosed) return;
      explicitlyClosed=true;
      setReady(false);
      if(reconnectHandle!==null){
        input.cancelReconnect(reconnectHandle);
        reconnectHandle=null;
      }
      generation+=1;
      const socket=physical;
      physical=null;
      detachCurrent?.();
      detachCurrent=null;
      socket?.close(code,reason);
      messageListeners.clear();
    },
  });
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

function readBettingAction(
  target: EventTarget | null,
): Readonly<{ type: BlackjackBettingActionType; chipCredits?: number }> | null {
  if (!(target instanceof Element)) return null;

  const chip=target.closest<HTMLButtonElement>("[data-blackjack-chip]");
  if (chip && !chip.disabled) {
    const credits=Number(chip.dataset.blackjackChip);
    if (Number.isSafeInteger(credits) && credits > 0) {
      return { type:"PLACE_BET", chipCredits:credits };
    }
  }

  const action=target.closest<HTMLButtonElement>("[data-blackjack-bet-action]");
  if (!action || action.disabled) return null;
  return action.dataset.blackjackBetAction === "CLEAR"
    ? { type:"CLEAR_BET" }
    : action.dataset.blackjackBetAction === "READY"
      ? { type:"READY" }
      : null;
}

function wantsHighChipDouble(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const button=target.closest<HTMLButtonElement>(
    '[data-blackjack-chip-scale="DOUBLE"]',
  );
  return !!button && !button.disabled;
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
  const baseViewContext: () => BlackjackSnapshotViewContext =
    options.getViewContext ?? (() => ({}));
  let actionClient: BlackjackPlayerActionClient | null=null;
  let bettingClient: BlackjackBettingClient | null=null;
  let privateStateClient: BlackjackPrivatePlayerStateClient | null=null;
  let seatClient: BlackjackSeatCommandClient | null=null;
  let controller: BlackjackRealtimeViewController | null=null;
  let selectedChipCredits=100;
  let transportConnected=false;
  let everReady=false;
  let sessionReplaced=false;
  const reconnectDelayMs=options.reconnectDelayMs ?? 750;
  if(!Number.isSafeInteger(reconnectDelayMs) || reconnectDelayMs<100){
    throw new RangeError(
      "Blackjack reconnectDelayMs must be a safe integer >= 100",
    );
  }
  const scheduleReconnect=
    options.scheduleReconnect ??
    ((callback:()=>void,delayMs:number)=>setTimeout(callback,delayMs));
  const cancelReconnect=
    options.cancelReconnect ??
    ((handle:unknown)=>clearTimeout(
      handle as ReturnType<typeof setTimeout>,
    ));
  const socket=createBlackjackResilientBrowserSocket(
    url,
    options.createSocket ?? defaultBlackjackSocketFactory,
    {
      autoReconnect:options.autoReconnect !== false,
      reconnectDelayMs,
      scheduleReconnect,
      cancelReconnect,
      onTransportReadyChange:(ready)=>{
        transportConnected=ready;
        if(ready) everReady=true;
        controller?.rerenderLatest();
      },
      onSessionReplaced:()=>{
        sessionReplaced=true;
        controller?.rerenderLatest();
      },
    },
  );
  const getViewContext=(): BlackjackSnapshotViewContext => {
    const base=baseViewContext();
    const playerPending=actionClient?.getPending() ?? null;
    const playerFeedback=actionClient?.getFeedback() ?? null;
    const bettingPending=bettingClient?.getPending() ?? null;
    const bettingFeedback=bettingClient?.getFeedback() ?? null;
    const bettingState=bettingClient?.getState() ?? null;
    const privateState=privateStateClient?.getState() ?? null;
    const privateBetting=privateState?.betting ?? null;
    const seatPending=seatClient?.getPending() ?? null;

    let actionStatusLabel: string | null=null;
    let actionStatusTone: "neutral" | "success" | "error"="neutral";

    if(sessionReplaced){
      actionStatusLabel="SESSION REPLACED";
      actionStatusTone="error";
    } else if(!transportConnected){
      actionStatusLabel="RECONNECTING…";
    } else if(seatPending!==null){
      actionStatusLabel=
        seatPending.type==="CLAIM_SEAT"
          ? "TAKING SEAT…"
          : "LEAVING TABLE…";
    } else if(playerPending!==null){
      actionStatusLabel=playerPending.phase === "ACKNOWLEDGED"
        ? playerPending.message.type + " · SYNCING"
        : playerPending.message.type + " · PROCESSING";
    } else if(bettingPending!==null){
      actionStatusLabel=bettingPending.phase === "ACKNOWLEDGED"
        ? "BET · SYNCING"
        : "BET · PROCESSING";
    } else if(playerFeedback!==null){
      actionStatusLabel =
        playerFeedback.status === "ACCEPTED"
          ? playerFeedback.actionType + " · CONFIRMED"
          : playerFeedback.error === "STALE_ACTION"
            ? "TABLE UPDATED · TRY AGAIN"
            : playerFeedback.error === "SESSION_REPLACED"
              ? "SESSION REPLACED"
              : playerFeedback.actionType + " · NOT AVAILABLE";
      actionStatusTone=playerFeedback.status === "ACCEPTED" ? "success" : "error";
    } else if(bettingFeedback!==null){
      actionStatusLabel =
        bettingFeedback.status === "ACCEPTED"
          ? bettingFeedback.actionType === "READY"
            ? "BET READY"
            : "BET UPDATED"
          : bettingFeedback.error === "STALE_ACTION"
            ? "TABLE UPDATED · TRY AGAIN"
            : bettingFeedback.error === "SESSION_REPLACED"
              ? "SESSION REPLACED"
              : "BET NOT AVAILABLE";
      actionStatusTone=bettingFeedback.status === "ACCEPTED" ? "success" : "error";
    }

    const connectionState=
      sessionReplaced
        ? "SESSION_REPLACED" as const
        : transportConnected
          ? "READY" as const
          : everReady
            ? "RECONNECTING" as const
            : "CONNECTING" as const;

    return {
      ...base,
      transportConnected,
      connectionState,
      localPlayerId:privateState?.playerId ?? base.localPlayerId ?? null,
      seatCommandPending:seatPending!==null,
      availableBalanceCents:
        privateState?.availableBalanceCents ??
        bettingState?.availableBalanceCents ??
        base.availableBalanceCents,
      actionPending:playerPending!==null,
      actionStatusLabel,
      actionStatusTone,
      bettingBetCents:
        privateBetting?.betCents ??
        bettingState?.betCents ??
        null,
      bettingStatus:
        privateBetting?.status ??
        bettingState?.status ??
        null,
      bettingPending:bettingPending!==null,
      selectedChipCredits,
    };
  };
  controller=bindBlackjackRealtimeElement(
    app,
    socket,
    getViewContext,
    options.nowMs,
  );
  const activeController=controller;
  const actions=createBlackjackPlayerActionClient({
    socket,
    getSnapshot:activeController.getSnapshot,
    getViewContext,
    createActionId:options.createActionId ?? defaultBlackjackActionId,
    onPendingChange:()=>{ activeController.rerenderLatest(); },
    onFeedbackChange:()=>{ activeController.rerenderLatest(); },
  });
  actionClient=actions;
  const betting=createBlackjackBettingClient({
    socket,
    getSnapshot:activeController.getSnapshot,
    getViewContext,
    createActionId:options.createActionId ?? defaultBlackjackActionId,
    onStateChange:()=>{ activeController.rerenderLatest(); },
  });
  bettingClient=betting;
  const privateState=createBlackjackPrivatePlayerStateClient({
    socket,
    getSnapshot:activeController.getSnapshot,
    onStateChange:()=>{ activeController.rerenderLatest(); },
  });
  privateStateClient=privateState;
  const seats=createBlackjackSeatCommandClient({
    socket,
    createRequestId:options.createActionId ?? defaultBlackjackActionId,
    onPendingChange:()=>{ activeController.rerenderLatest(); },
  });
  seatClient=seats;

  const renderTickMs=options.renderTickMs ?? 1_000;
  if(!Number.isSafeInteger(renderTickMs) || renderTickMs<50){
    throw new RangeError(
      "Blackjack visual renderTickMs must be a safe integer >= 50",
    );
  }
  const scheduleRender=
    options.scheduleRender ??
    ((callback:()=>void,intervalMs:number)=>setInterval(callback,intervalMs));
  const cancelRender=
    options.cancelRender ??
    ((handle:unknown)=>clearInterval(
      handle as ReturnType<typeof setInterval>,
    ));
  const renderHandle=scheduleRender(()=>{
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }

    activeController.rerenderLatest();
  },renderTickMs);

  const onVisibilityChange=()=>{
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
    ) {
      activeController.rerenderLatest();
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener(
      "visibilitychange",
      onVisibilityChange,
    );
  }

  const onClick=(event: Event) => {
    if(event.target instanceof Element){
      const seatAction=event.target.closest<HTMLButtonElement>(
        "[data-blackjack-seat-action]",
      );
      if(seatAction && !seatAction.disabled){
        try {
          if(seatAction.dataset.blackjackSeatAction==="LEAVE"){
            seats.leave();
          } else if(seatAction.dataset.blackjackSeatAction==="CLAIM"){
            const seatNumber=Number(seatAction.dataset.seat);
            if(
              seatNumber===1 || seatNumber===2 ||
              seatNumber===3 || seatNumber===4 ||
              seatNumber===5
            ){
              seats.claim(seatNumber);
            }
          }
        } catch {
          return;
        }
        return;
      }
    }

    if(wantsHighChipDouble(event.target)){
      try {
        selectedChipCredits=doubleBlackjackChipCredits(
          Math.max(selectedChipCredits,1_000),
        );
        activeController.rerenderLatest();
      } catch {
        return;
      }
      return;
    }

    const bettingAction=readBettingAction(event.target);
    if(bettingAction!==null){
      try {
        if(bettingAction.chipCredits!==undefined){
          selectedChipCredits=bettingAction.chipCredits;
          betting.submit("PLACE_BET",bettingAction.chipCredits*100);
        } else {
          betting.submit(bettingAction.type);
        }
      } catch {
        return;
      }
      return;
    }

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

  const getStatus=(): BlackjackBrowserConnectionStatus => {
    const state=
      closed
        ? "CLOSED" as const
        : sessionReplaced
          ? "SESSION_REPLACED" as const
          : transportConnected && activeController.getCursor()!==null
            ? "READY" as const
            : everReady
              ? "RECONNECTING" as const
              : "CONNECTING" as const;
    return Object.freeze({
      state,
      transportConnected,
      cursor:activeController.getCursor(),
    });
  };

  return Object.freeze({
    url,
    socket,
    controller:activeController,
    actions,
    betting,
    privateState,
    seats,
    getStatus,
    close:()=>{
      if(closed) return;
      closed=true;
      app.removeEventListener("click",onClick);
      if (typeof document !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          onVisibilityChange,
        );
      }
      cancelRender(renderHandle);
      seats.detach();
      privateState.detach();
      betting.detach();
      actions.detach();
      activeController.detach();
      socket.close(1000,"BLACKJACK_CLIENT_CLOSED");
    },
  });
}
