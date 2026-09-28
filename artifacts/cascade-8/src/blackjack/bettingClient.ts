import {
  isBlackjackChipDenomination,
} from "./bettingView";
import type { BlackjackRealtimeSocketLike } from "./realtimeClient";
import type {
  BlackjackPublicSnapshotViewSource,
  BlackjackSnapshotViewContext,
} from "./snapshotView";

export type BlackjackBettingActionType =
  | "PLACE_BET"
  | "CLEAR_BET"
  | "READY";

export type BlackjackBettingState = Readonly<{
  roundId: string;
  status: "OPEN" | "READY" | "LOCKED";
  betCents: number;
  availableBalanceCents: number;
}>;

export type BlackjackBettingActionMessage = Readonly<{
  type: BlackjackBettingActionType;
  actionId: string;
  expectedStateVersion: number;
  roundId: string;
  seatNumber: 1 | 2 | 3 | 4 | 5;
  chipValueCents?: number;
}>;

export type BlackjackPendingBettingAction = Readonly<{
  message: BlackjackBettingActionMessage;
  phase: "SENT" | "ACKNOWLEDGED";
  acceptedStateVersion: number | null;
  acceptedEventSequence: number | null;
  acceptedBettingState: BlackjackBettingState | null;
}>;

export type BlackjackBettingFeedback = Readonly<{
  status: "ACCEPTED" | "REJECTED";
  actionId: string;
  actionType: BlackjackBettingActionType;
  error: string | null;
}>;

export type BlackjackBettingClient = Readonly<{
  submit: (
    type: BlackjackBettingActionType,
    chipValueCents?: number,
  ) => BlackjackBettingActionMessage;
  receive: (rawMessage: unknown) => void;
  getState: () => BlackjackBettingState | null;
  getPending: () => BlackjackPendingBettingAction | null;
  getFeedback: () => BlackjackBettingFeedback | null;
  isPending: () => boolean;
  clearFeedback: () => void;
  detach: () => void;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMessage(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function assertNonEmptyId(label: string, value: string): string {
  if (!value.trim()) {
    throw new Error("Blackjack betting client " + label + " must be non-empty");
  }
  return value;
}

function getLocalBettingSeat(
  snapshot: BlackjackPublicSnapshotViewSource,
  context: BlackjackSnapshotViewContext,
): 1 | 2 | 3 | 4 | 5 {
  if (snapshot.phase !== "BETTING" || snapshot.round === null) {
    throw new Error("Blackjack betting action requires BETTING phase");
  }
  const playerId=context.localPlayerId;
  if (!playerId) {
    throw new Error("Blackjack betting action requires localPlayerId");
  }
  const player=snapshot.players.find(
    (candidate)=>candidate.playerId===playerId,
  );
  if (!player) {
    throw new Error("Blackjack betting action requires a seated local player");
  }
  return player.seatNumber;
}

function parseBettingState(value: unknown): BlackjackBettingState | null {
  if (!isRecord(value)) return null;
  if (typeof value.roundId !== "string" || !value.roundId.trim()) return null;
  if (
    value.status !== "OPEN" &&
    value.status !== "READY" &&
    value.status !== "LOCKED"
  ) {
    return null;
  }
  if (
    typeof value.betCents !== "number" ||
    !Number.isSafeInteger(value.betCents) ||
    value.betCents < 0 ||
    typeof value.availableBalanceCents !== "number" ||
    !Number.isSafeInteger(value.availableBalanceCents) ||
    value.availableBalanceCents < 0
  ) {
    return null;
  }

  return Object.freeze({
    roundId:value.roundId,
    status:value.status,
    betCents:value.betCents,
    availableBalanceCents:value.availableBalanceCents,
  });
}

function snapshotCursor(
  message: unknown,
): Readonly<{ stateVersion: number; eventSequence: number; roundId: string | null }> | null {
  if (!isRecord(message)) return null;
  const candidate=
    message.type === "snapshot" || message.type === "FULL_TABLE_SNAPSHOT"
      ? message.snapshot
      : null;
  if (!isRecord(candidate)) return null;
  if (
    typeof candidate.stateVersion !== "number" ||
    !Number.isSafeInteger(candidate.stateVersion) ||
    candidate.stateVersion < 0 ||
    typeof candidate.eventSequence !== "number" ||
    !Number.isSafeInteger(candidate.eventSequence) ||
    candidate.eventSequence < 0
  ) {
    return null;
  }
  const round=isRecord(candidate.round) ? candidate.round : null;
  return {
    stateVersion:candidate.stateVersion,
    eventSequence:candidate.eventSequence,
    roundId:round && typeof round.roundId === "string" ? round.roundId : null,
  };
}

export function buildBlackjackBettingActionMessage(
  snapshot: BlackjackPublicSnapshotViewSource,
  context: BlackjackSnapshotViewContext,
  type: BlackjackBettingActionType,
  actionId: string,
  chipValueCents?: number,
): BlackjackBettingActionMessage {
  const seatNumber=getLocalBettingSeat(snapshot,context);
  const roundId=snapshot.round?.roundId;
  if (!roundId?.trim()) {
    throw new Error("Blackjack betting action requires roundId");
  }

  if (type === "PLACE_BET") {
    if (
      chipValueCents === undefined ||
      !Number.isSafeInteger(chipValueCents) ||
      chipValueCents <= 0 ||
      chipValueCents % 100 !== 0 ||
      !isBlackjackChipDenomination(chipValueCents / 100)
    ) {
      throw new Error("Blackjack betting action requires valid chipValueCents");
    }
  }

  return Object.freeze({
    type,
    actionId:assertNonEmptyId("actionId",actionId),
    expectedStateVersion:snapshot.stateVersion,
    roundId,
    seatNumber,
    ...(type === "PLACE_BET" ? { chipValueCents } : {}),
  });
}

export function createBlackjackBettingClient(input: {
  socket: BlackjackRealtimeSocketLike;
  getSnapshot: () => BlackjackPublicSnapshotViewSource | null;
  getViewContext: () => BlackjackSnapshotViewContext;
  createActionId: () => string;
  onStateChange?: () => void;
}): BlackjackBettingClient {
  let state: BlackjackBettingState | null=null;
  let pending: BlackjackPendingBettingAction | null=null;
  let feedback: BlackjackBettingFeedback | null=null;
  let detached=false;

  const changed=()=>input.onStateChange?.();

  const clearForDifferentRound=(roundId: string | null) => {
    if(state!==null && state.roundId!==roundId){
      state=null;
      feedback=null;
      changed();
    }
  };

  const resolveAccepted=(cursor:{
    stateVersion:number;
    eventSequence:number;
    roundId:string|null;
  })=>{
    if(pending===null || pending.phase!=="ACKNOWLEDGED") return;
    if (
      pending.acceptedStateVersion===null ||
      pending.acceptedEventSequence===null ||
      cursor.stateVersion < pending.acceptedStateVersion ||
      cursor.eventSequence < pending.acceptedEventSequence
    ) {
      return;
    }

    const completed=pending;
    if (
      completed.acceptedBettingState!==null &&
      completed.acceptedBettingState.roundId===cursor.roundId
    ) {
      state=completed.acceptedBettingState;
    }
    pending=null;
    feedback=Object.freeze({
      status:"ACCEPTED",
      actionId:completed.message.actionId,
      actionType:completed.message.type,
      error:null,
    });
    changed();
  };

  const receive=(rawMessage: unknown)=>{
    if(detached) return;
    const message=parseMessage(rawMessage);
    if(!isRecord(message)) return;

    const cursor=snapshotCursor(message);
    if(cursor!==null){
      clearForDifferentRound(cursor.roundId);
      resolveAccepted(cursor);
    }

    if(pending===null) return;

    if (
      message.type==="ACTION_ACCEPTED" &&
      message.actionId===pending.message.actionId &&
      typeof message.stateVersion==="number" &&
      Number.isSafeInteger(message.stateVersion) &&
      message.stateVersion>=0 &&
      typeof message.eventSequence==="number" &&
      Number.isSafeInteger(message.eventSequence) &&
      message.eventSequence>=0
    ) {
      const acceptedBettingState=parseBettingState(message.betting);
      if(acceptedBettingState===null){
        const failed=pending;
        pending=null;
        feedback=Object.freeze({
          status:"REJECTED",
          actionId:failed.message.actionId,
          actionType:failed.message.type,
          error:"BETTING_STATE_UNAVAILABLE",
        });
        changed();
        return;
      }

      pending=Object.freeze({
        ...pending,
        phase:"ACKNOWLEDGED",
        acceptedStateVersion:message.stateVersion,
        acceptedEventSequence:message.eventSequence,
        acceptedBettingState,
      });
      changed();

      const latest=input.getSnapshot();
      if(latest!==null){
        resolveAccepted({
          stateVersion:latest.stateVersion,
          eventSequence:latest.eventSequence,
          roundId:latest.round?.roundId ?? null,
        });
      }
      return;
    }

    if (
      message.type==="ACTION_REJECTED" &&
      message.actionId===pending.message.actionId
    ) {
      const failed=pending;
      pending=null;
      feedback=Object.freeze({
        status:"REJECTED",
        actionId:failed.message.actionId,
        actionType:failed.message.type,
        error:typeof message.error==="string" ? message.error : "INVALID_ACTION",
      });
      changed();
      return;
    }

    if(message.type==="error" || message.type==="SESSION_REPLACED"){
      const failed=pending;
      pending=null;
      feedback=Object.freeze({
        status:"REJECTED",
        actionId:failed.message.actionId,
        actionType:failed.message.type,
        error:
          message.type==="SESSION_REPLACED"
            ? "SESSION_REPLACED"
            : typeof message.error==="string"
              ? message.error
              : "BLACKJACK_ACTION_ERROR",
      });
      changed();
    }
  };

  const onMessage=(event: MessageEvent<unknown>)=>receive(event.data);
  input.socket.addEventListener("message",onMessage);

  return Object.freeze({
    submit:(type,chipValueCents)=>{
      if(detached) throw new Error("Blackjack betting client is detached");
      if(pending!==null){
        throw new Error("Blackjack betting action is already pending");
      }
      const snapshot=input.getSnapshot();
      if(snapshot===null){
        throw new Error("Blackjack betting action requires authoritative snapshot");
      }
      feedback=null;
      const message=buildBlackjackBettingActionMessage(
        snapshot,
        input.getViewContext(),
        type,
        input.createActionId(),
        chipValueCents,
      );
      pending=Object.freeze({
        message,
        phase:"SENT",
        acceptedStateVersion:null,
        acceptedEventSequence:null,
        acceptedBettingState:null,
      });
      changed();
      try {
        input.socket.send(JSON.stringify(message));
      } catch(error) {
        pending=null;
        changed();
        throw error;
      }
      return message;
    },
    receive,
    getState:()=>state,
    getPending:()=>pending,
    getFeedback:()=>feedback,
    isPending:()=>pending!==null,
    clearFeedback:()=>{
      feedback=null;
      changed();
    },
    detach:()=>{
      if(detached) return;
      detached=true;
      input.socket.removeEventListener("message",onMessage);
      pending=null;
      feedback=null;
    },
  });
}
