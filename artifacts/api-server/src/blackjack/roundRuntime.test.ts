import { describe, expect, it } from "vitest";
import {
  BlackjackPlayerActionCoordinator,
  type BlackjackCoordinatedAction,
} from "./actionCoordinator";
import type { BlackjackRound, BlackjackTable } from "./domain";
import { createBlackjackReservationBook } from "./reservations";
import { runBlackjackRoundRuntimeTick } from "./roundRuntime";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function bettingTable(): BlackjackTable {
  const foundation=createBlackjackTableFoundation({
    tableId:"round-runtime-table",
    shoe:createUnshuffledBlackjackShoe({
      shoeId:"round-runtime-shoe",
      createdAtMs:1,
    }),
  });
  const round: BlackjackRound={
    roundId:"round-runtime-1",
    roundNumber:1,
    phase:"BETTING",
    activeSeatOrder:[],
    hands:[],
    dealer:{cards:[],holeCardRevealed:false},
    currentTurn:null,
    startedAtMs:0,
    bettingClosesAtMs:10_000,
    finishedAtMs:null,
  };

  return {
    ...foundation,
    phase:"BETTING",
    seats:foundation.seats.map((seat)=>
      seat.seatNumber===2
        ? {...seat,playerId:"player-2"}
        : seat,
    ),
    players:[{
      playerId:"player-2",
      userId:"user-2",
      sessionId:"session-2",
      seatNumber:2,
      status:"BETTING",
      connected:true,
      disconnectedAtMs:null,
      handIds:[],
    }],
    round,
  };
}

function coordinator(){
  return new BlackjackPlayerActionCoordinator({
    table:bettingTable(),
    accounts:[{
      playerId:"player-2",
      userId:"user-2",
      wallet:createBlackjackWalletLedgerState({
        userId:"user-2",
        totalBalanceCents:100_000,
      }),
      book:createBlackjackReservationBook("user-2"),
    }],
    bettingLimits:{minBetCents:1_000,maxBetCents:null},
  });
}

function action(
  type:"PLACE_BET"|"READY",
  actionId:string,
  expectedStateVersion:number,
): BlackjackCoordinatedAction {
  return {
    envelope:{
      actionId,
      actorPlayerId:"player-2",
      type,
      tableId:"round-runtime-table",
      expectedStateVersion,
      roundId:"round-runtime-1",
      handId:null,
      seatNumber:2,
      payloadFingerprint:type+"|"+actionId,
    },
    nowMs:9_000,
    ...(type==="PLACE_BET"
      ? {
          chipValueCents:1_000,
          reservationId:"reservation-"+actionId,
          reserveTransactionId:"reserve-"+actionId,
        }
      : {}),
  };
}

describe("blackjack authoritative round runtime tick",()=>{
  it("waits before the betting deadline without mutating state",async()=>{
    const game=coordinator();
    const before=game.getTable();

    const tick=await runBlackjackRoundRuntimeTick(game,{nowMs:9_999});

    expect(tick.status).toBe("WAITING_FOR_BETTING_DEADLINE");
    expect(tick.transitions).toEqual([]);
    expect(tick.table).toBe(before);
    expect(game.getTable().stateVersion).toBe(0);
    expect(game.getTable().eventSequence).toBe(0);
  });

  it("closes betting and starts the initial deal in one authoritative deadline tick",async()=>{
    const game=coordinator();
    await game.submit(action("PLACE_BET","bet-1",0));
    await game.submit(action("READY","ready-1",1));

    const beforeIndex=game.getTable().shoe.nextIndex;
    const tick=await runBlackjackRoundRuntimeTick(game,{nowMs:10_000});

    expect(tick.status).toBe("ROUND_STARTED");
    expect(tick.transitions.map((transition)=>transition.type)).toEqual([
      "BETTING_LOCKED",
      "INITIAL_DEAL_COMMITTED",
    ]);
    expect(tick.transitions.map((transition)=>({
      phase:transition.table.phase,
      stateVersion:transition.table.stateVersion,
      eventSequence:transition.table.eventSequence,
    }))).toEqual([
      {phase:"BETTING_LOCKED",stateVersion:3,eventSequence:3},
      {phase:"PLAYER_TURNS",stateVersion:4,eventSequence:4},
    ]);
    expect(game.getTable().shoe.nextIndex).toBe(beforeIndex+4);
    expect(game.getTable().round?.currentTurn?.seatNumber).toBe(2);
  });

  it("closes an empty betting window once and does not attempt an initial deal",async()=>{
    const game=coordinator();

    const tick=await runBlackjackRoundRuntimeTick(game,{nowMs:10_000});

    expect(tick.status).toBe("BETTING_CLOSED_EMPTY");
    expect(tick.transitions.map((transition)=>transition.type)).toEqual([
      "BETTING_LOCKED",
    ]);
    expect(game.getTable().phase).toBe("BETTING_LOCKED");
    expect(game.getTable().shoe.nextIndex).toBe(0);

    const replay=await runBlackjackRoundRuntimeTick(game,{nowMs:10_001});
    expect(replay.status).toBe("BETTING_CLOSED_EMPTY");
    expect(replay.transitions).toEqual([]);
    expect(game.getTable().stateVersion).toBe(1);
    expect(game.getTable().eventSequence).toBe(1);
  });
});
