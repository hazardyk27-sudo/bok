import {
  buildBlackjackTableViewModelFromSnapshot,
  type BlackjackPublicSnapshotViewSource,
  type BlackjackSnapshotViewContext,
} from "./snapshotView";
import { renderBlackjackTableShell, type BlackjackTableViewModel } from "./tableView";

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
  isAwaitingResync: () => boolean;
  detach: () => void;
}>;

export type BlackjackRealtimeViewBindingOptions = Readonly<{
  socket: BlackjackRealtimeSocketLike;
  renderModel: (model: BlackjackTableViewModel) => void;
  getViewContext?: () => BlackjackSnapshotViewContext;
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
  let awaitingResync=false;
  let detached=false;

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

  const renderSnapshot=(snapshot: BlackjackPublicSnapshotViewSource): boolean => {
    try {
      const model=buildBlackjackTableViewModelFromSnapshot(
        snapshot,
        options.getViewContext?.() ?? {},
      );
      options.renderModel(model);
      cursor=Object.freeze({
        eventSequence:snapshot.eventSequence,
        stateVersion:snapshot.stateVersion,
      });
      awaitingResync=false;
      return true;
    } catch {
      requestResync();
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

    renderSnapshot(envelope.snapshot);
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

    renderSnapshot(snapshot);
  };

  const onMessage=(event: MessageEvent<unknown>) => {
    receive(event.data);
  };

  options.socket.addEventListener("message",onMessage);

  return Object.freeze({
    receive,
    getCursor:()=>cursor,
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
): BlackjackRealtimeViewController {
  return bindBlackjackRealtimeView({
    socket,
    getViewContext,
    renderModel:(model)=>{
      app.innerHTML=renderBlackjackTableShell(model);
    },
  });
}
