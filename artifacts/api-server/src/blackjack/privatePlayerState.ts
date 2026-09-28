import type {
  BlackjackPlayerActionCoordinator,
} from "./actionCoordinator";
import {
  getBlackjackBetTotalCents,
} from "./betting";
import type {
  BlackjackPublicSnapshot,
} from "./publicSnapshot";
import type {
  BlackjackRealtimeIdentity,
} from "./realtime";

export type BlackjackPrivatePlayerState = Readonly<{
  type: "PRIVATE_PLAYER_STATE";
  stateVersion: number;
  eventSequence: number;
  roundId: string | null;
  availableBalanceCents: number;
  reservedBalanceCents: number;
  betting: Readonly<{
    roundId: string;
    status: "OPEN" | "READY" | "LOCKED";
    betCents: number;
  }> | null;
}>;

export function buildBlackjackPrivatePlayerState(
  coordinator: BlackjackPlayerActionCoordinator,
  identity: BlackjackRealtimeIdentity,
  snapshot: BlackjackPublicSnapshot,
): BlackjackPrivatePlayerState | null {
  const table=coordinator.getTable();

  // Runtime ticks can expose multiple historical public transitions after
  // the coordinator has already reached the final transition. Never attach
  // final wallet data to an older public cursor.
  if(
    table.stateVersion!==snapshot.stateVersion ||
    table.eventSequence!==snapshot.eventSequence
  ){
    return null;
  }

  const player=table.players.find(
    (candidate)=>candidate.playerId===identity.playerId,
  );
  if(!player || player.userId!==identity.userId){
    return null;
  }

  const account=coordinator.getAccount(identity.playerId);
  if(account.userId!==identity.userId){
    return null;
  }

  const position=coordinator.getBettingPosition(identity.playerId);
  const roundId=snapshot.round?.roundId ?? null;
  const betting=
    snapshot.phase==="BETTING" &&
    position!==null &&
    position.roundId===roundId
      ? Object.freeze({
          roundId:position.roundId,
          status:position.status,
          betCents:getBlackjackBetTotalCents(position),
        })
      : null;

  return Object.freeze({
    type:"PRIVATE_PLAYER_STATE" as const,
    stateVersion:snapshot.stateVersion,
    eventSequence:snapshot.eventSequence,
    roundId,
    availableBalanceCents:account.wallet.availableBalanceCents,
    reservedBalanceCents:account.wallet.reservedBalanceCents,
    betting,
  });
}
