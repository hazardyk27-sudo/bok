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

export type BlackjackPlayerActionClient = Readonly<{
  submit: (type: BlackjackPlayerActionType) => BlackjackPlayerActionMessage;
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

export function createBlackjackPlayerActionClient(input: {
  socket: BlackjackRealtimeSocketLike;
  getSnapshot: () => BlackjackPublicSnapshotViewSource | null;
  getViewContext: () => BlackjackSnapshotViewContext;
  createActionId: () => string;
}): BlackjackPlayerActionClient {
  return Object.freeze({
    submit:(type)=>{
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
      input.socket.send(JSON.stringify(message));
      return message;
    },
  });
}
