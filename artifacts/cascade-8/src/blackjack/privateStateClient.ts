import type {
  BlackjackRealtimeSocketLike,
} from "./realtimeClient";
import type {
  BlackjackPublicSnapshotViewSource,
} from "./snapshotView";

export type BlackjackPrivatePlayerStateView = Readonly<{
  stateVersion: number;
  eventSequence: number;
  roundId: string | null;
  playerId: string;
  availableBalanceCents: number;
  reservedBalanceCents: number;
  betting: Readonly<{
    roundId: string;
    status: "OPEN" | "READY" | "LOCKED";
    betCents: number;
  }> | null;
}>;

export type BlackjackPrivatePlayerStateClient = Readonly<{
  receive: (rawMessage: unknown) => void;
  getState: () => BlackjackPrivatePlayerStateView | null;
  getPlayerId: () => string | null;
  detach: () => void;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value==="object" && value!==null;
}

function parseMessage(raw: unknown): unknown {
  if(typeof raw!=="string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseBetting(value: unknown):
  BlackjackPrivatePlayerStateView["betting"] | undefined {
  if(value===null) return null;
  if(!isRecord(value)) return undefined;
  if(
    typeof value.roundId!=="string" ||
    !value.roundId.trim() ||
    (
      value.status!=="OPEN" &&
      value.status!=="READY" &&
      value.status!=="LOCKED"
    ) ||
    typeof value.betCents!=="number" ||
    !Number.isSafeInteger(value.betCents) ||
    value.betCents<0
  ){
    return undefined;
  }
  return Object.freeze({
    roundId:value.roundId,
    status:value.status,
    betCents:value.betCents,
  });
}

function parsePrivateState(
  rawMessage: unknown,
): BlackjackPrivatePlayerStateView | null {
  const message=parseMessage(rawMessage);
  if(!isRecord(message) || message.type!=="PRIVATE_PLAYER_STATE"){
    return null;
  }
  if(
    typeof message.stateVersion!=="number" ||
    !Number.isSafeInteger(message.stateVersion) ||
    message.stateVersion<0 ||
    typeof message.eventSequence!=="number" ||
    !Number.isSafeInteger(message.eventSequence) ||
    message.eventSequence<0 ||
    (
      message.roundId!==null &&
      typeof message.roundId!=="string"
    ) ||
    typeof message.playerId!=="string" ||
    !message.playerId.trim() ||
    typeof message.availableBalanceCents!=="number" ||
    !Number.isSafeInteger(message.availableBalanceCents) ||
    message.availableBalanceCents<0 ||
    typeof message.reservedBalanceCents!=="number" ||
    !Number.isSafeInteger(message.reservedBalanceCents) ||
    message.reservedBalanceCents<0
  ){
    return null;
  }

  const betting=parseBetting(message.betting);
  if(betting===undefined) return null;

  return Object.freeze({
    stateVersion:message.stateVersion,
    eventSequence:message.eventSequence,
    roundId:message.roundId as string|null,
    playerId:message.playerId,
    availableBalanceCents:message.availableBalanceCents,
    reservedBalanceCents:message.reservedBalanceCents,
    betting,
  });
}

function snapshotFromTransportMessage(
  rawMessage:unknown,
):BlackjackPublicSnapshotViewSource|null{
  const message=parseMessage(rawMessage);
  if(!isRecord(message)) return null;
  const candidate=
    message.type==="snapshot" || message.type==="FULL_TABLE_SNAPSHOT"
      ? message.snapshot
      : null;
  if(!isRecord(candidate)) return null;
  if(
    typeof candidate.stateVersion!=="number" ||
    !Number.isSafeInteger(candidate.stateVersion) ||
    candidate.stateVersion<0 ||
    typeof candidate.eventSequence!=="number" ||
    !Number.isSafeInteger(candidate.eventSequence) ||
    candidate.eventSequence<0
  ){
    return null;
  }
  return candidate as unknown as BlackjackPublicSnapshotViewSource;
}

function matchesSnapshot(
  state:BlackjackPrivatePlayerStateView,
  snapshot:BlackjackPublicSnapshotViewSource,
):boolean{
  return (
    snapshot.stateVersion===state.stateVersion &&
    snapshot.eventSequence===state.eventSequence &&
    (snapshot.round?.roundId ?? null)===state.roundId
  );
}

function isPrivateStateAhead(
  state:BlackjackPrivatePlayerStateView,
  snapshot:BlackjackPublicSnapshotViewSource,
):boolean{
  return (
    state.eventSequence>snapshot.eventSequence ||
    (
      state.eventSequence===snapshot.eventSequence &&
      state.stateVersion>snapshot.stateVersion
    )
  );
}

function isNewerPrivateState(
  left:BlackjackPrivatePlayerStateView,
  right:BlackjackPrivatePlayerStateView,
):boolean{
  return (
    left.eventSequence>right.eventSequence ||
    (
      left.eventSequence===right.eventSequence &&
      left.stateVersion>right.stateVersion
    )
  );
}

export function createBlackjackPrivatePlayerStateClient(input: {
  socket: BlackjackRealtimeSocketLike;
  getSnapshot: () => BlackjackPublicSnapshotViewSource | null;
  onStateChange?: () => void;
}): BlackjackPrivatePlayerStateClient {
  let state: BlackjackPrivatePlayerStateView | null=null;
  let pending: BlackjackPrivatePlayerStateView | null=null;
  let playerId: string | null=null;
  let detached=false;

  const apply=(next:BlackjackPrivatePlayerStateView)=>{
    state=next;
    pending=null;
    input.onStateChange?.();
  };

  const reconcilePending=()=>{
    if(pending===null) return;
    const snapshot=input.getSnapshot();
    if(snapshot===null) return;

    if(matchesSnapshot(pending,snapshot)){
      apply(pending);
      return;
    }

    if(!isPrivateStateAhead(pending,snapshot)){
      pending=null;
    }
  };

  const receive=(rawMessage: unknown)=>{
    if(detached) return;

    const next=parsePrivateState(rawMessage);
    if(next!==null){
      if(playerId!==null && playerId!==next.playerId){
        return;
      }
      const identityChanged=playerId===null;
      playerId=next.playerId;

      const snapshot=input.getSnapshot();
      if(snapshot!==null && matchesSnapshot(next,snapshot)){
        apply(next);
        return;
      }

      if(
        snapshot===null ||
        isPrivateStateAhead(next,snapshot)
      ){
        if(
          pending===null ||
          isNewerPrivateState(next,pending)
        ){
          pending=next;
        }
      }

      if(identityChanged){
        input.onStateChange?.();
      }
      return;
    }

    if(snapshotFromTransportMessage(rawMessage)!==null){
      reconcilePending();
    }
  };

  const onMessage=(event: MessageEvent<unknown>)=>receive(event.data);
  input.socket.addEventListener("message",onMessage);

  return Object.freeze({
    receive,
    getState:()=>{
      if(state===null) return null;
      const snapshot=input.getSnapshot();
      return snapshot!==null && matchesSnapshot(state,snapshot)
        ? state
        : null;
    },
    getPlayerId:()=>playerId,
    detach:()=>{
      if(detached) return;
      detached=true;
      input.socket.removeEventListener("message",onMessage);
      state=null;
      pending=null;
      playerId=null;
    },
  });
}
