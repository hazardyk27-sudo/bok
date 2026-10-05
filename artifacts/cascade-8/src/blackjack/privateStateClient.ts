import {
  createBlackjackBetStackPresentation,
  type BlackjackBetStackPresentation,
} from "./betStackPresentation";
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
    activeChipValuesCents: readonly number[];
  }> | null;
}>;

export type BlackjackPrivatePlayerStateClient = Readonly<{
  receive: (rawMessage: unknown) => void;
  getState: () => BlackjackPrivatePlayerStateView | null;
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

function parseChipValues(value: unknown): readonly number[] | null {
  if(!Array.isArray(value)) return null;
  const chips:number[]=[];
  for(const chip of value){
    if(
      typeof chip!=="number" ||
      !Number.isSafeInteger(chip) ||
      chip<=0
    ){
      return null;
    }
    chips.push(chip);
  }
  return Object.freeze(chips);
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
  const activeChipValuesCents=
    value.activeChipValuesCents===undefined
      ? Object.freeze([] as number[])
      : parseChipValues(value.activeChipValuesCents);
  if(activeChipValuesCents===null) return undefined;
  return Object.freeze({
    roundId:value.roundId,
    status:value.status,
    betCents:value.betCents,
    activeChipValuesCents,
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

function stateMatchesSnapshot(
  snapshot: BlackjackPublicSnapshotViewSource | null,
  state: BlackjackPrivatePlayerStateView,
): boolean {
  return (
    snapshot!==null &&
    snapshot.stateVersion===state.stateVersion &&
    snapshot.eventSequence===state.eventSequence &&
    (snapshot.round?.roundId ?? null)===state.roundId
  );
}

export function createBlackjackPrivatePlayerStateClient(input: {
  socket: BlackjackRealtimeSocketLike;
  getSnapshot: () => BlackjackPublicSnapshotViewSource | null;
  onStateChange?: () => void;
}): BlackjackPrivatePlayerStateClient {
  let state: BlackjackPrivatePlayerStateView | null=null;
  let pendingState: BlackjackPrivatePlayerStateView | null=null;
  let detached=false;
  const betStack: BlackjackBetStackPresentation | null=
    typeof document!=="undefined" && document.body
      ? createBlackjackBetStackPresentation(document.body)
      : null;

  const syncBetStack=(next:BlackjackPrivatePlayerStateView)=>{
    const betting=next.betting;
    betStack?.sync({
      chipValuesCents:betting?.activeChipValuesCents ?? [],
      betCents:betting?.betCents ?? 0,
      status:betting?.status ?? null,
      pending:false,
    });
  };

  const applyPendingState=()=>{
    const next=pendingState;
    if(next===null || !stateMatchesSnapshot(input.getSnapshot(),next)){
      return;
    }
    pendingState=null;
    state=next;
    input.onStateChange?.();
    // onStateChange rerenders the authoritative local-seat marker first;
    // the physical stack is then rebuilt from the private server state.
    syncBetStack(next);
  };

  const receive=(rawMessage: unknown)=>{
    if(detached) return;

    // The public realtime controller is registered before this client. On a
    // snapshot message it has therefore advanced getSnapshot() by the time
    // this listener runs, allowing an early private state to reconcile here.
    applyPendingState();

    const next=parsePrivateState(rawMessage);
    if(next===null) return;

    // Never apply private wallet/player/bet data against a different public
    // cursor. Retain it until the matching authoritative snapshot arrives.
    pendingState=next;
    applyPendingState();
  };

  const onMessage=(event: MessageEvent<unknown>)=>receive(event.data);
  input.socket.addEventListener("message",onMessage);

  return Object.freeze({
    receive,
    getState:()=>state,
    detach:()=>{
      if(detached) return;
      detached=true;
      input.socket.removeEventListener("message",onMessage);
      betStack?.clear();
      pendingState=null;
      state=null;
    },
  });
}
