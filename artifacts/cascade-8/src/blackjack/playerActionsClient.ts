import type { BlackjackRealtimeSocketLike } from "./realtimeClient";
import type {
  BlackjackPublicSnapshotViewSource,
  BlackjackSnapshotViewContext,
} from "./snapshotView";

export const BLACKJACK_PLAYER_ACTION_TYPES = [
  "HIT",
  "STAND",
  "DOUBLE",
  "SPLIT",
] as const;

export type BlackjackPlayerActionType =
  (typeof BLACKJACK_PLAYER_ACTION_TYPES)[number];

export type BlackjackPlayerActionMessage = Readonly<{
  type: BlackjackPlayerActionType;
  actionId: string;
  expectedStateVersion: number;
  roundId: string;
  handId: string;
  seatNumber: 1 | 2 | 3 | 4 | 5;
}>;

export type BlackjackPendingPlayerAction = Readonly<{
  message: BlackjackPlayerActionMessage;
  phase: "SENT" | "ACKNOWLEDGED";
  acceptedStateVersion: number | null;
  acceptedEventSequence: number | null;
}>;

export type BlackjackPlayerActionFeedback = Readonly<{
  status: "ACCEPTED" | "REJECTED";
  actionId: string;
  actionType: BlackjackPlayerActionType;
  error: string | null;
}>;

export type BlackjackPlayerActionClient = Readonly<{
  submit: (type: BlackjackPlayerActionType) => BlackjackPlayerActionMessage;
  receive: (rawMessage: unknown) => void;
  getPending: () => BlackjackPendingPlayerAction | null;
  getFeedback: () => BlackjackPlayerActionFeedback | null;
  isPending: () => boolean;
  clearFeedback: () => void;
  detach: () => void;
}>;

function assertNonEmptyId(label: string, value: string): string {
  if (!value.trim()) {
    throw new Error("Blackjack client " + label + " must be non-empty");
  }
  return value;
}

function getLocalCurrentHand(
  snapshot: BlackjackPublicSnapshotViewSource,
  context: BlackjackSnapshotViewContext,
) {
  const localPlayerId=context.localPlayerId;
  if (!localPlayerId) {
    throw new Error("Blackjack player action requires localPlayerId");
  }
  if (snapshot.phase !== "PLAYER_TURNS" || snapshot.round === null) {
    throw new Error("Blackjack player action requires PLAYER_TURNS");
  }

  const turn=snapshot.round.currentTurn;
  if (turn === null) {
    throw new Error("Blackjack player action requires an active turn");
  }

  const player=snapshot.players.find(
    (candidate) => candidate.playerId === localPlayerId,
  );
  if (!player || player.seatNumber !== turn.seatNumber) {
    throw new Error("Blackjack player action is not the local player's turn");
  }

  const hand=snapshot.round.hands.find(
    (candidate) =>
      candidate.handId === turn.handId &&
      candidate.playerId === localPlayerId &&
      candidate.seatNumber === turn.seatNumber,
  );
  if (!hand || hand.status !== "ACTIVE") {
    throw new Error("Blackjack player action requires the active local hand");
  }

  return { turn, hand };
}

function hasExtraStake(
  context: BlackjackSnapshotViewContext,
  betCents: number,
): boolean {
  return (
    context.availableBalanceCents !== null &&
    context.availableBalanceCents !== undefined &&
    Number.isSafeInteger(context.availableBalanceCents) &&
    context.availableBalanceCents >= betCents
  );
}

export function getBlackjackAvailablePlayerActions(
  snapshot: BlackjackPublicSnapshotViewSource,
  context: BlackjackSnapshotViewContext,
): readonly BlackjackPlayerActionType[] {
  if (context.actionPending === true) return Object.freeze([]);

  try {
    const { hand }=getLocalCurrentHand(snapshot,context);
    const actions: BlackjackPlayerActionType[]=["HIT","STAND"];

    if (hand.cards.length === 2 && hasExtraStake(context,hand.betCents)) {
      actions.push("DOUBLE");
      if (hand.cards[0]?.rank === hand.cards[1]?.rank) {
        actions.push("SPLIT");
      }
    }

    return Object.freeze(actions);
  } catch {
    return Object.freeze([]);
  }
}

export function buildBlackjackPlayerActionMessage(
  snapshot: BlackjackPublicSnapshotViewSource,
  context: BlackjackSnapshotViewContext,
  type: BlackjackPlayerActionType,
  actionId: string,
): BlackjackPlayerActionMessage {
  const available=getBlackjackAvailablePlayerActions(snapshot,context);
  if (!available.includes(type)) {
    throw new Error("Blackjack client player action is not currently available");
  }

  const { turn }=getLocalCurrentHand(snapshot,context);
  const round=snapshot.round;
  if (round === null || !round.roundId?.trim()) {
    throw new Error("Blackjack player action requires active roundId");
  }

  return Object.freeze({
    type,
    actionId:assertNonEmptyId("actionId",actionId),
    expectedStateVersion:snapshot.stateVersion,
    roundId:round.roundId,
    handId:turn.handId,
    seatNumber:turn.seatNumber,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTransportMessage(rawMessage: unknown): unknown {
  if (typeof rawMessage !== "string") return rawMessage;
  try {
    return JSON.parse(rawMessage);
  } catch {
    return null;
  }
}

function snapshotCursorFromMessage(
  message: unknown,
): Readonly<{ stateVersion: number; eventSequence: number }> | null {
  if (!isRecord(message)) return null;

  const candidate =
    message.type === "snapshot"
      ? message.snapshot
      : message.type === "FULL_TABLE_SNAPSHOT"
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

  return {
    stateVersion: candidate.stateVersion,
    eventSequence: candidate.eventSequence,
  };
}

export function createBlackjackPlayerActionClient(input: {
  socket: BlackjackRealtimeSocketLike;
  getSnapshot: () => BlackjackPublicSnapshotViewSource | null;
  getViewContext: () => BlackjackSnapshotViewContext;
  createActionId: () => string;
  onPendingChange?: (pending: BlackjackPendingPlayerAction | null) => void;
  onFeedbackChange?: (feedback: BlackjackPlayerActionFeedback | null) => void;
}): BlackjackPlayerActionClient {
  let pending: BlackjackPendingPlayerAction | null = null;
  let feedback: BlackjackPlayerActionFeedback | null = null;
  let detached=false;

  const setPending=(next: BlackjackPendingPlayerAction | null) => {
    pending=next;
    input.onPendingChange?.(pending);
  };

  const setFeedback=(next: BlackjackPlayerActionFeedback | null) => {
    feedback=next;
    input.onFeedbackChange?.(feedback);
  };

  const resolveFromSnapshot=(cursor: {
    stateVersion: number;
    eventSequence: number;
  }) => {
    if (pending === null) return;

    if (
      pending.phase === "ACKNOWLEDGED" &&
      pending.acceptedStateVersion !== null &&
      pending.acceptedEventSequence !== null &&
      cursor.stateVersion >= pending.acceptedStateVersion &&
      cursor.eventSequence >= pending.acceptedEventSequence
    ) {
      const resolved=pending;
      setPending(null);
      setFeedback(Object.freeze({
        status:"ACCEPTED",
        actionId:resolved.message.actionId,
        actionType:resolved.message.type,
        error:null,
      }));
      return;
    }

    if (
      pending.phase === "SENT" &&
      cursor.stateVersion > pending.message.expectedStateVersion
    ) {
      setPending(null);
    }
  };

  const receive=(rawMessage: unknown) => {
    if(detached || pending===null) return;

    const message=parseTransportMessage(rawMessage);
    if (!isRecord(message)) return;

    if (
      message.type === "ACTION_ACCEPTED" &&
      message.actionId === pending.message.actionId &&
      typeof message.stateVersion === "number" &&
      Number.isSafeInteger(message.stateVersion) &&
      message.stateVersion >= 0 &&
      typeof message.eventSequence === "number" &&
      Number.isSafeInteger(message.eventSequence) &&
      message.eventSequence >= 0
    ) {
      const latest=input.getSnapshot();
      const acknowledged=Object.freeze({
        ...pending,
        phase:"ACKNOWLEDGED" as const,
        acceptedStateVersion:message.stateVersion,
        acceptedEventSequence:message.eventSequence,
      });
      setPending(acknowledged);

      if (
        latest !== null &&
        latest.stateVersion >= message.stateVersion &&
        latest.eventSequence >= message.eventSequence
      ) {
        setPending(null);
      }
      return;
    }

    if (
      message.type === "ACTION_REJECTED" &&
      message.actionId === pending.message.actionId
    ) {
      const rejected=pending;
      setPending(null);
      setFeedback(Object.freeze({
        status:"REJECTED",
        actionId:rejected.message.actionId,
        actionType:rejected.message.type,
        error:typeof message.error === "string" ? message.error : "INVALID_ACTION",
      }));
      return;
    }

    if (message.type === "error") {
      const rejected=pending;
      setPending(null);
      setFeedback(Object.freeze({
        status:"REJECTED",
        actionId:rejected.message.actionId,
        actionType:rejected.message.type,
        error:typeof message.error === "string" ? message.error : "BLACKJACK_ACTION_ERROR",
      }));
      return;
    }

    if (message.type === "SESSION_REPLACED") {
      const rejected=pending;
      setPending(null);
      setFeedback(Object.freeze({
        status:"REJECTED",
        actionId:rejected.message.actionId,
        actionType:rejected.message.type,
        error:"SESSION_REPLACED",
      }));
      return;
    }

    const cursor=snapshotCursorFromMessage(message);
    if(cursor!==null) resolveFromSnapshot(cursor);
  };

  const onMessage=(event: MessageEvent<unknown>) => {
    receive(event.data);
  };
  input.socket.addEventListener("message",onMessage);

  return Object.freeze({
    submit:(type)=>{
      if(detached){
        throw new Error("Blackjack player action client is detached");
      }
      if(pending!==null){
        throw new Error("Blackjack player action is already pending");
      }

      setFeedback(null);

      const snapshot=input.getSnapshot();
      if(snapshot===null){
        throw new Error("Blackjack player action requires authoritative snapshot");
      }
      const message=buildBlackjackPlayerActionMessage(
        snapshot,
        input.getViewContext(),
        type,
        input.createActionId(),
      );
      setPending(Object.freeze({
        message,
        phase:"SENT",
        acceptedStateVersion:null,
        acceptedEventSequence:null,
      }));

      try {
        input.socket.send(JSON.stringify(message));
      } catch (error) {
        setPending(null);
        throw error;
      }
      return message;
    },
    receive,
    getPending:()=>pending,
    getFeedback:()=>feedback,
    isPending:()=>pending!==null,
    clearFeedback:()=>setFeedback(null),
    detach:()=>{
      if(detached) return;
      detached=true;
      input.socket.removeEventListener("message",onMessage);
      if(pending!==null) setPending(null);
    },
  });
}
