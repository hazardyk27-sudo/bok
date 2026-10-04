import { describe, expect, it } from "vitest";
import {
  BlackjackPlayerActionCoordinator,
  type BlackjackCoordinatedAction,
} from "./actionCoordinator";
import type { BlackjackRound, BlackjackTable } from "./domain";
import { createBlackjackReservationBook } from "./reservations";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function bettingTable(): BlackjackTable {
  const foundation=createBlackjackTableFoundation({
    tableId:"main-blackjack",
    shoe:createUnshuffledBlackjackShoe({
      shoeId:"betting-coordinator-shoe",
      createdAtMs:1,
    }),
  });
  const round: BlackjackRound={
    roundId:"round-bet",
    roundNumber:1,
    phase:"BETTING",
    activeSeatOrder:[],
    hands:[],
    dealer:{ cards:[], holeCardRevealed:false },
    currentTurn:null,
    startedAtMs:0,
    bettingClosesAtMs:10_000,
    finishedAtMs:null,
  };
  return {
    ...foundation,
    phase:"BETTING",
    seats:foundation.seats.map((seat)=>
      seat.seatNumber===3 ? { ...seat, playerId:"player-1" } : seat,
    ),
    players:[{
      playerId:"player-1",
      userId:"user-1",
      sessionId:"session-1",
      seatNumber:3,
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
      playerId:"player-1",
      userId:"user-1",
      wallet:createBlackjackWalletLedgerState({
        userId:"user-1",
        totalBalanceCents:500_000,
      }),
      book:createBlackjackReservationBook("user-1"),
    }],
    bettingLimits:{ minBetCents:100_000, maxBetCents:null },
  });
}

function action(
  type:"PLACE_BET"|"CLEAR_BET"|"READY",
  actionId:string,
  expectedStateVersion:number,
): BlackjackCoordinatedAction {
  return {
    envelope:{
      actionId,
      actorPlayerId:"player-1",
      type,
      tableId:"main-blackjack",
      expectedStateVersion,
      roundId:"round-bet",
      handId:null,
      seatNumber:3,
      payloadFingerprint:type+"|"+actionId,
    },
    nowMs:1_000,
    ...(type==="PLACE_BET" ? {
      chipValueCents:100_000,
      reservationId:"reservation-"+actionId,
      reserveTransactionId:"reserve-"+actionId,
    } : {}),
    ...(type==="CLEAR_BET" ? {
      clearTransactionId:"clear-"+actionId,
    } : {}),
  };
}

describe("blackjack coordinated betting actions",()=>{
  it("places and clears a realtime bet through versioned coordinator state",async()=>{
    const game=coordinator();
    const placed=await game.submit(action("PLACE_BET","bet-1",0));

    expect(placed.replayed).toBe(false);
    expect(placed.betting).toEqual({
      roundId:"round-bet",
      status:"OPEN",
      betCents:100_000,
      availableBalanceCents:400_000,
    });
    expect(game.getTable().stateVersion).toBe(1);
    expect(game.getTable().eventSequence).toBe(1);
    expect(game.getAccount("player-1").wallet.reservedBalanceCents).toBe(100_000);

    const cleared=await game.submit(action("CLEAR_BET","clear-1",1));
    expect(cleared.betting).toEqual({
      roundId:"round-bet",
      status:"OPEN",
      betCents:0,
      availableBalanceCents:500_000,
    });
    expect(game.getAccount("player-1").wallet.reservedBalanceCents).toBe(0);
    expect(game.getTable().stateVersion).toBe(2);
    expect(game.getTable().eventSequence).toBe(2);
  });

  it("marks a funded bet READY and reflects that status on the table player",async()=>{
    const game=coordinator();
    await game.submit(action("PLACE_BET","bet-ready",0));
    const ready=await game.submit(action("READY","ready-1",1));

    expect(ready.betting).toEqual({
      roundId:"round-bet",
      status:"READY",
      betCents:100_000,
      availableBalanceCents:400_000,
    });
    expect(game.getTable().players[0].status).toBe("READY");
    expect(game.getBettingPosition("player-1")?.status).toBe("READY");
    expect(game.getProtocol().receipts).toHaveLength(2);
  });

  it("rejects betting after deadline without reserving funds",async()=>{
    const game=coordinator();
    const late={ ...action("PLACE_BET","late",0), nowMs:10_000 };
    await expect(game.submit(late)).rejects.toThrow(/window is closed/);
    expect(game.getAccount("player-1").wallet.reservedBalanceCents).toBe(0);
    expect(game.getTable().stateVersion).toBe(0);
  });
});

describe("blackjack empty betting rollover state",()=>{
  it("drops expired betting positions when an unready round reopens",async()=>{
    const game=coordinator();
    await game.submit(action("PLACE_BET","bet-expire",0));

    expect(game.getAccount("player-1").wallet.reservedBalanceCents).toBe(100_000);
    expect(game.getBettingPosition("player-1")?.roundId).toBe("round-bet");

    const closed=await game.closeBettingWindow(10_000);

    expect(closed.replayed).toBe(false);
    expect(game.getTable().phase).toBe("BETTING");
    expect(game.getTable().round?.roundId).toBe("main-blackjack:round-2");
    expect(game.getBettingPosition("player-1")).toBeNull();
    expect(game.getBettingPositions()).toEqual([]);
    expect(game.getAccount("player-1").wallet.reservedBalanceCents).toBe(0);
  });
});
