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
  reconnectMaxDelayMs?: number;
  reconnectJitterRatio?: number;
  reconnectRandom?: () => number;
  heartbeatIntervalMs?: number;
  snapshotTimeoutMs?: number;
  scheduleTransportTimer?: (
    callback: () => void,
    delayMs: number,
  ) => unknown;
  cancelTransportTimer?: (handle: unknown) => void;
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
  | "ERROR"
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

function parseMessage(raw: unknown): Record<string, unknown> | null {
  const value=
    typeof raw==="string"
      ? (()=>{ try { return JSON.parse(raw); } catch { return null; } })()
      : raw;
  return typeof value==="object" && value!==null
    ? value as Record<string,unknown>
    : null;
}

function reconnectDelayForAttempt(input:{
  attempt:number;
  baseDelayMs:number;
  maxDelayMs:number;
  jitterRatio:number;
  random:()=>number;
}):number{
  const exponent=Math.max(0,Math.min(input.attempt-1,20));
  const uncapped=input.baseDelayMs*(2**exponent);
  const capped=Math.min(input.maxDelayMs,uncapped);
  const random=Math.max(0,Math.min(1,input.random()));
  const factor=1-input.jitterRatio+(2*input.jitterRatio*random);
  return Math.max(100,Math.round(capped*factor));
}

function createBlackjackResilientBrowserSocket(
  url: string,
  factory: BlackjackBrowserSocketFactory,
  input: {
    autoReconnect: boolean;
    reconnectDelayMs: number;
    reconnectMaxDelayMs: number;
    reconnectJitterRatio: number;
    reconnectRandom: () => number;
    heartbeatIntervalMs: number;
    snapshotTimeoutMs: number;
    scheduleReconnect: (callback:()=>void,delayMs:number)=>unknown;
    cancelReconnect: (handle:unknown)=>void;
    scheduleTransportTimer: (callback:()=>void,delayMs:number)=>unknown;
    cancelTransportTimer: (handle:unknown)=>void;
    onTransportReadyChange: (ready:boolean)=>void;
    onSessionReplaced: () => void;
    onTerminalError: () => void;
  },
): BlackjackBrowserSocket {
  const messageListeners=new Set<
    (event: MessageEvent<unknown>)=>void
  >();
  let physical: BlackjackPhysicalSocket | null=null;
  let reconnectHandle: unknown | null=null;
  let heartbeatHandle: unknown | null=null;
  let snapshotTimeoutHandle: unknown | null=null;
  let explicitlyClosed=false;
  let transportReady=false;
  let terminalSessionReplaced=false;
  let terminalError=false;
  let generation=0;
  let reconnectAttempt=0;
  let detachCurrent: (()=>void) | null=null;

  const setReady=(ready:boolean)=>{
    if(transportReady===ready) return;
    transportReady=ready;
    input.onTransportReadyChange(ready);
  };

  const clearTransportTimers=()=>{
    if(heartbeatHandle!==null){
      input.cancelTransportTimer(heartbeatHandle);
      heartbeatHandle=null;
    }
    if(snapshotTimeoutHandle!==null){
      input.cancelTransportTimer(snapshotTimeoutHandle);
      snapshotTimeoutHandle=null;
    }
  };

  const scheduleSnapshotTimeout=(
    socket: BlackjackPhysicalSocket,
    ownGeneration: number,
  )=>{
    if(snapshotTimeoutHandle!==null){
      input.cancelTransportTimer(snapshotTimeoutHandle);
    }
    snapshotTimeoutHandle=input.scheduleTransportTimer(()=>{
      snapshotTimeoutHandle=null;
      if(
        explicitlyClosed ||
        terminalSessionReplaced ||
        terminalError ||
        ownGeneration!==generation ||
        physical!==socket
      ) return;
      setReady(false);
      socket.close(4002,"BLACKJACK_SNAPSHOT_TIMEOUT");
    },input.snapshotTimeoutMs);
  };

  const scheduleHeartbeat=(
    socket: BlackjackPhysicalSocket,
    ownGeneration: number,
  )=>{
    if(heartbeatHandle!==null){
      input.cancelTransportTimer(heartbeatHandle);
    }
    heartbeatHandle=input.scheduleTransportTimer(()=>{
      heartbeatHandle=null;
      if(
        explicitlyClosed ||
        terminalSessionReplaced ||
        terminalError ||
        ownGeneration!==generation ||
        physical!==socket ||
        !transportReady
      ) return;
      try {
        socket.send(JSON.stringify({type:"sync"}));
        scheduleSnapshotTimeout(socket,ownGeneration);
      } catch {
        setReady(false);
        socket.close(4002,"BLACKJACK_HEARTBEAT_SEND_FAILED");
      }
    },input.heartbeatIntervalMs);
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

  const scheduleReconnect=()=>{
    if(
      explicitlyClosed ||
      terminalSessionReplaced ||
      terminalError ||
      !input.autoReconnect
    ) return;
    reconnectAttempt+=1;
    const delayMs=reconnectDelayForAttempt({
      attempt:reconnectAttempt,
      baseDelayMs:input.reconnectDelayMs,
      maxDelayMs:input.reconnectMaxDelayMs,
      jitterRatio:input.reconnectJitterRatio,
      random:input.reconnectRandom,
    });
    if(reconnectHandle!==null){
      input.cancelReconnect(reconnectHandle);
    }
    reconnectHandle=input.scheduleReconnect(()=>{
      reconnectHandle=null;
      connect();
    },delayMs);
  };

  const connect=()=>{
    if(explicitlyClosed || terminalSessionReplaced || terminalError) return;
    const socket=factory(url) as BlackjackPhysicalSocket;
    physical=socket;
    const ownGeneration=++generation;
    setReady(false);
    clearTransportTimers();
    scheduleSnapshotTimeout(socket,ownGeneration);

    const handlers={
      message:(event: Event | MessageEvent<unknown>)=>{
        if(ownGeneration!==generation) return;
        const message=event as MessageEvent<unknown>;
        const parsed=parseMessage(message.data);
        const type=
          parsed && typeof parsed.type==="string"
            ? parsed.type
            : null;

        if(type==="FULL_TABLE_SNAPSHOT"){
          reconnectAttempt=0;
          if(snapshotTimeoutHandle!==null){
            input.cancelTransportTimer(snapshotTimeoutHandle);
            snapshotTimeoutHandle=null;
          }
          setReady(true);
          scheduleHeartbeat(socket,ownGeneration);
        } else if(type==="SESSION_REPLACED"){
          terminalSessionReplaced=true;
          setReady(false);
          clearTransportTimers();
          input.onSessionReplaced();
        } else if(
          type==="error" &&
          parsed?.error==="BLACKJACK_SNAPSHOT_UNAVAILABLE"
        ){
          setReady(false);
          clearTransportTimers();
          socket.close(4002,"BLACKJACK_SNAPSHOT_UNAVAILABLE");
        } else if(
          type==="error" &&
          parsed?.error==="BLACKJACK_IDENTITY_UNAVAILABLE"
        ){
          terminalError=true;
          setReady(false);
          clearTransportTimers();
          input.onTerminalError();
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
        clearTransportTimers();
        setReady(false);
        const code=
          "code" in event && typeof event.code==="number"
            ? event.code
            : 0;

        if(code===4001 && !terminalSessionReplaced){
          terminalSessionReplaced=true;
          input.onSessionReplaced();
        } else if(
          code===1002 ||
          code===1003 ||
          code===1007 ||
          code===1008 ||
          code===1009
        ){
          terminalError=true;
          input.onTerminalError();
        }

        scheduleReconnect();
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
      clearTransportTimers();
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
  let selectedSeatForClaim: 1 | 2 | 3 | 4 | 5 | null=null;
  let openDrawer: "BET" | "INFO" | null=null;
  let transportConnected=false;
  let everReady=false;
  let sessionReplaced=false;
  let terminalConnectionError=false;
  const reconnectDelayMs=options.reconnectDelayMs ?? 500;
  if(!Number.isSafeInteger(reconnectDelayMs) || reconnectDelayMs<100){
    throw new RangeError(
      "Blackjack reconnectDelayMs must be a safe integer >= 100",
    );
  }
  const reconnectMaxDelayMs=options.reconnectMaxDelayMs ?? 8_000;
  if(
    !Number.isSafeInteger(reconnectMaxDelayMs) ||
    reconnectMaxDelayMs<reconnectDelayMs
  ){
    throw new RangeError(
      "Blackjack reconnectMaxDelayMs must be a safe integer >= reconnectDelayMs",
    );
  }
  const reconnectJitterRatio=options.reconnectJitterRatio ?? 0.2;
  if(
    !Number.isFinite(reconnectJitterRatio) ||
    reconnectJitterRatio<0 ||
    reconnectJitterRatio>0.5
  ){
    throw new RangeError(
      "Blackjack reconnectJitterRatio must be between 0 and 0.5",
    );
  }
  const heartbeatIntervalMs=options.heartbeatIntervalMs ?? 10_000;
  const snapshotTimeoutMs=options.snapshotTimeoutMs ?? 5_000;
  if(
    !Number.isSafeInteger(heartbeatIntervalMs) ||
    heartbeatIntervalMs<1_000 ||
    !Number.isSafeInteger(snapshotTimeoutMs) ||
    snapshotTimeoutMs<500
  ){
    throw new RangeError(
      "Blackjack heartbeat/snapshot timeouts are invalid",
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
  const scheduleTransportTimer=
    options.scheduleTransportTimer ??
    ((callback:()=>void,delayMs:number)=>setTimeout(callback,delayMs));
  const cancelTransportTimer=
    options.cancelTransportTimer ??
    ((handle:unknown)=>clearTimeout(
      handle as ReturnType<typeof setTimeout>,
    ));
  const socket=createBlackjackResilientBrowserSocket(
    url,
    options.createSocket ?? defaultBlackjackSocketFactory,
    {
      autoReconnect:options.autoReconnect !== false,
      reconnectDelayMs,
      reconnectMaxDelayMs,
      reconnectJitterRatio,
      reconnectRandom:options.reconnectRandom ?? Math.random,
      heartbeatIntervalMs,
      snapshotTimeoutMs,
      scheduleReconnect,
      cancelReconnect,
      scheduleTransportTimer,
      cancelTransportTimer,
      onTransportReadyChange:(ready)=>{
        transportConnected=ready;
        if(ready) everReady=true;
        controller?.rerenderLatest();
      },
      onSessionReplaced:()=>{
        sessionReplaced=true;
        controller?.rerenderLatest();
      },
      onTerminalError:()=>{
        terminalConnectionError=true;
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
    const latestSnapshot=controller?.getSnapshot() ?? null;
    if(openDrawer==="BET" && latestSnapshot?.phase!=="BETTING"){
      openDrawer=null;
    }

    let actionStatusLabel: string | null=null;
    let actionStatusTone: "neutral" | "success" | "error"="neutral";

    if(sessionReplaced){
      actionStatusLabel="SESSION REPLACED";
      actionStatusTone="error";
    } else if(terminalConnectionError){
      actionStatusLabel="CONNECTION ERROR";
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
        : terminalConnectionError
          ? "ERROR" as const
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
      selectedSeatForClaim,
      openDrawer,
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
      const drawerToggle=event.target.closest<HTMLButtonElement>(
        "[data-blackjack-drawer-toggle]",
      );
      if(drawerToggle && !drawerToggle.disabled){
        const drawer=drawerToggle.dataset.blackjackDrawerToggle;
        if(drawer==="BET" || drawer==="INFO"){
          openDrawer=openDrawer===drawer ? null : drawer;
          activeController.rerenderLatest();
        }
        return;
      }

      const drawerClose=event.target.closest<HTMLElement>(
        "[data-blackjack-drawer-close]",
      );
      if(drawerClose){
        openDrawer=null;
        activeController.rerenderLatest();
        return;
      }

      const seatConfirm=event.target.closest<HTMLButtonElement>(
        "[data-blackjack-seat-confirm-action]",
      );
      if(seatConfirm && !seatConfirm.disabled){
        const action=seatConfirm.dataset.blackjackSeatConfirmAction;
        if(action==="CANCEL"){
          selectedSeatForClaim=null;
          activeController.rerenderLatest();
          return;
        }
        if(action==="CONFIRM" && selectedSeatForClaim!==null){
          try {
            const seatNumber=selectedSeatForClaim;
            selectedSeatForClaim=null;
            seats.claim(seatNumber);
            activeController.rerenderLatest();
          } catch {
            activeController.rerenderLatest();
          }
          return;
        }
      }

      const seatSelectable=event.target.closest<HTMLElement>(
        '[data-blackjack-seat-select="true"]',
      );
      if(seatSelectable){
        const seatNumber=Number(seatSelectable.dataset.seat);
        if(
          seatNumber===1 || seatNumber===2 ||
          seatNumber===3 || seatNumber===4 ||
          seatNumber===5
        ){
          selectedSeatForClaim=seatNumber;
          activeController.rerenderLatest();
        }
        return;
      }

      const seatAction=event.target.closest<HTMLButtonElement>(
        "[data-blackjack-seat-action]",
      );
      if(seatAction && !seatAction.disabled){
        try {
          if(seatAction.dataset.blackjackSeatAction==="LEAVE"){
            seats.leave();
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
  const onKeyDown=(event: KeyboardEvent)=>{
    if(event.key==="Escape" && openDrawer!==null){
      openDrawer=null;
      activeController.rerenderLatest();
      return;
    }
    if(event.key!=="Enter" && event.key!==" ") return;
    if(!(event.target instanceof Element)) return;
    const seat=event.target.closest<HTMLElement>(
      '[data-blackjack-seat-select="true"]',
    );
    if(!seat) return;
    const seatNumber=Number(seat.dataset.seat);
    if(
      seatNumber!==1 && seatNumber!==2 && seatNumber!==3 &&
      seatNumber!==4 && seatNumber!==5
    ) return;
    event.preventDefault();
    selectedSeatForClaim=seatNumber;
    activeController.rerenderLatest();
  };

  app.addEventListener("click",onClick);
  app.addEventListener("keydown",onKeyDown);
  let closed=false;

  const getStatus=(): BlackjackBrowserConnectionStatus => {
    const state=
      closed
        ? "CLOSED" as const
        : sessionReplaced
          ? "SESSION_REPLACED" as const
          : terminalConnectionError
            ? "ERROR" as const
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
      app.removeEventListener("keydown",onKeyDown);
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
