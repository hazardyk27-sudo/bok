import {
  buildBlackjackTableViewModelFromSnapshot,
  type BlackjackPublicSnapshotViewSource,
  type BlackjackSnapshotViewContext,
} from "./snapshotView";
import { createBlackjackTableDomRenderer } from "./domRenderer";
import {
  BLACKJACK_PRESENTATION_EVENT_NAME,
  createBlackjackPresentationQueue,
  deriveBlackjackPresentationEvents,
  type BlackjackPresentationEvent,
} from "./presentationQueue";
import {
  BLACKJACK_DEFAULT_TABLE_VIEW,
  type BlackjackTableViewModel,
} from "./tableView";

export type BlackjackRealtimeCursor = Readonly<{
  eventSequence: number;
  stateVersion: number;
}>;

export type BlackjackRealtimeSocketLike = Readonly<{
  send: (data: string) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
  removeEventListener: (
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
}>;

export type BlackjackRealtimeViewController = Readonly<{
  receive: (rawMessage: unknown) => void;
  getCursor: () => BlackjackRealtimeCursor | null;
  getSnapshot: () => BlackjackPublicSnapshotViewSource | null;
  rerenderLatest: () => boolean;
  isAwaitingResync: () => boolean;
  detach: () => void;
}>;

export type BlackjackRealtimeViewBindingOptions = Readonly<{
  socket: BlackjackRealtimeSocketLike;
  renderModel: (model: BlackjackTableViewModel) => void;
  getViewContext?: () => BlackjackSnapshotViewContext;
  nowMs?: () => number;
  onPresentationEvents?: (
    events: readonly BlackjackPresentationEvent[],
  ) => void;
}>;

type BlackjackFullSnapshotEnvelope = Readonly<{
  type: "FULL_TABLE_SNAPSHOT";
  snapshot: BlackjackPublicSnapshotViewSource;
  resetEventSequenceTo: number;
  resetStateVersionTo: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function parseTransportMessage(rawMessage: unknown): unknown {
  if (typeof rawMessage !== "string") return rawMessage;

  try {
    return JSON.parse(rawMessage);
  } catch {
    return null;
  }
}

function getMessageType(message: unknown): string | null {
  return isRecord(message) && typeof message.type === "string"
    ? message.type
    : null;
}

function getSnapshotCandidate(
  value: unknown,
): BlackjackPublicSnapshotViewSource | null {
  if (!isRecord(value)) return null;
  if (!isSafeNonNegativeInteger(value.eventSequence)) return null;
  if (!isSafeNonNegativeInteger(value.stateVersion)) return null;
  if (!isSafeNonNegativeInteger(value.serverTimeMs)) return null;
  return value as unknown as BlackjackPublicSnapshotViewSource;
}

function getFullSnapshotEnvelope(
  message: unknown,
): BlackjackFullSnapshotEnvelope | null {
  if (!isRecord(message) || message.type !== "FULL_TABLE_SNAPSHOT") {
    return null;
  }

  const snapshot=getSnapshotCandidate(message.snapshot);
  if (
    snapshot === null ||
    !isSafeNonNegativeInteger(message.resetEventSequenceTo) ||
    !isSafeNonNegativeInteger(message.resetStateVersionTo)
  ) {
    return null;
  }

  return {
    type: "FULL_TABLE_SNAPSHOT",
    snapshot,
    resetEventSequenceTo: message.resetEventSequenceTo,
    resetStateVersionTo: message.resetStateVersionTo,
  };
}

export function bindBlackjackRealtimeView(
  options: BlackjackRealtimeViewBindingOptions,
): BlackjackRealtimeViewController {
  let cursor: BlackjackRealtimeCursor | null = null;
  let latestSnapshot: BlackjackPublicSnapshotViewSource | null = null;
  let awaitingResync=false;
  let detached=false;
  let latestSnapshotReceivedAtClientMs: number | null=null;
  const nowMs=options.nowMs ?? Date.now;

  const readClientNowMs=(): number => {
    const value=nowMs();
    if(!Number.isSafeInteger(value) || value<0){
      throw new RangeError(
        "Blackjack client clock must be a non-negative safe integer",
      );
    }
    return value;
  };

  const projectedSnapshot=(
    snapshot: BlackjackPublicSnapshotViewSource,
  ): BlackjackPublicSnapshotViewSource => {
    if(latestSnapshotReceivedAtClientMs===null) return snapshot;
    const elapsed=Math.max(
      0,
      readClientNowMs()-latestSnapshotReceivedAtClientMs,
    );
    const projectedServerTimeMs=snapshot.serverTimeMs+elapsed;
    if(!Number.isSafeInteger(projectedServerTimeMs)){
      return snapshot;
    }
    return Object.freeze({
      ...snapshot,
      serverTimeMs:projectedServerTimeMs,
    });
  };

  const requestResync=() => {
    if(detached || awaitingResync) return;

    const request =
      cursor === null
        ? { type: "sync" as const }
        : {
            type: "sync" as const,
            lastEventSequence: cursor.eventSequence,
            lastStateVersion: cursor.stateVersion,
          };

    awaitingResync=true;
    options.socket.send(JSON.stringify(request));
  };

  const publishPresentationTransition=(
    previous: BlackjackPublicSnapshotViewSource | null,
    next: BlackjackPublicSnapshotViewSource,
  ): void => {
    if(previous===null || options.onPresentationEvents===undefined) return;
    try {
      const events=deriveBlackjackPresentationEvents(previous,next);
      if(events.length>0) options.onPresentationEvents(events);
    } catch {
      // Presentation is deliberately non-authoritative. Animation failures must
      // never request a resync or poison the realtime state machine.
    }
  };

  const renderSnapshot=(
    snapshot: BlackjackPublicSnapshotViewSource,
    emitPresentationEvents: boolean,
  ): boolean => {
    try {
      const receivedAt=readClientNowMs();
      const previousSnapshot=latestSnapshot;
      const model=buildBlackjackTableViewModelFromSnapshot(
        snapshot,
        options.getViewContext?.() ?? {},
      );
      options.renderModel(model);
      cursor=Object.freeze({
        eventSequence:snapshot.eventSequence,
        stateVersion:snapshot.stateVersion,
      });
      latestSnapshot=snapshot;
      latestSnapshotReceivedAtClientMs=receivedAt;
      awaitingResync=false;
      if(emitPresentationEvents){
        publishPresentationTransition(previousSnapshot,snapshot);
      }
      return true;
    } catch {
      requestResync();
      return false;
    }
  };

  const rerenderLatest=(): boolean => {
    if(detached || latestSnapshot===null) return false;
    try {
      options.renderModel(
        buildBlackjackTableViewModelFromSnapshot(
          projectedSnapshot(latestSnapshot),
          options.getViewContext?.() ?? {},
        ),
      );
      return true;
    } catch {
      return false;
    }
  };

  const applyFullSnapshot=(envelope: BlackjackFullSnapshotEnvelope): void => {
    if (
      envelope.resetEventSequenceTo !== envelope.snapshot.eventSequence ||
      envelope.resetStateVersionTo !== envelope.snapshot.stateVersion
    ) {
      requestResync();
      return;
    }

    // Full snapshots are recovery/baseline material. Never replay historical
    // dealing animations when a player connects or resynchronizes.
    renderSnapshot(envelope.snapshot,false);
  };

  const receive=(rawMessage: unknown): void => {
    if(detached) return;

    const message=parseTransportMessage(rawMessage);
    const type=getMessageType(message);

    if(type==="FULL_TABLE_SNAPSHOT"){
      const envelope=getFullSnapshotEnvelope(message);
      if(envelope===null){
        requestResync();
        return;
      }
      applyFullSnapshot(envelope);
      return;
    }

    if(type==="ACTION_REJECTED" && isRecord(message)){
      const nested=getFullSnapshotEnvelope(message.resync);
      if(nested!==null){
        applyFullSnapshot(nested);
      }
      return;
    }

    if(type!=="snapshot" || !isRecord(message)) return;

    const snapshot=getSnapshotCandidate(message.snapshot);
    if(snapshot===null){
      requestResync();
      return;
    }

    if(cursor===null){
      requestResync();
      return;
    }

    if(awaitingResync) return;

    if(snapshot.eventSequence<=cursor.eventSequence) return;

    if(
      snapshot.eventSequence!==cursor.eventSequence+1 ||
      snapshot.stateVersion<cursor.stateVersion
    ){
      requestResync();
      return;
    }

    renderSnapshot(snapshot,true);
  };

  const onMessage=(event: MessageEvent<unknown>) => {
    receive(event.data);
  };

  options.socket.addEventListener("message",onMessage);

  return Object.freeze({
    receive,
    getCursor:()=>cursor,
    getSnapshot:()=>latestSnapshot,
    rerenderLatest,
    isAwaitingResync:()=>awaitingResync,
    detach:()=>{
      if(detached) return;
      detached=true;
      options.socket.removeEventListener("message",onMessage);
    },
  });
}

export function bindBlackjackRealtimeElement(
  app: HTMLElement,
  socket: BlackjackRealtimeSocketLike,
  getViewContext?: () => BlackjackSnapshotViewContext,
  nowMs?: () => number,
): BlackjackRealtimeViewController {
  const renderer=createBlackjackTableDomRenderer(
    app,
    BLACKJACK_DEFAULT_TABLE_VIEW,
  );
  const presentationQueue=createBlackjackPresentationQueue({
    play:(event)=>{
      if(
        typeof CustomEvent!=="undefined" &&
        typeof app.dispatchEvent==="function"
      ){
        app.dispatchEvent(new CustomEvent<BlackjackPresentationEvent>(
          BLACKJACK_PRESENTATION_EVENT_NAME,
          { detail:event },
        ));
      }
    },
  });

  const controller=bindBlackjackRealtimeView({
    socket,
    getViewContext,
    nowMs,
    renderModel:renderer.render,
    onPresentationEvents:(events)=>{ presentationQueue.enqueue(events); },
  });

  return Object.freeze({
    ...controller,
    detach:()=>{
      presentationQueue.clear();
      controller.detach();
    },
  });
}
