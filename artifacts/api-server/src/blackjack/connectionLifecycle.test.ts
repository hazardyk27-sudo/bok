import { describe, expect, it } from "vitest";
import {
  BlackjackPlayerActionCoordinator,
} from "./actionCoordinator";
import type {
  BlackjackHand,
  BlackjackRound,
  BlackjackTable,
} from "./domain";
import {
  createBlackjackRealtimeConnectionLifecycle,
} from "./connectionLifecycle";
import {
  createBlackjackCoordinatorRealtimeSource,
} from "./roundRealtime";
import { runBlackjackRoundRuntimeTick } from "./roundRuntime";
import {
  createBlackjackReservationBook,
  reserveBlackjackWager,
} from "./reservations";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function activeTable(turnEndsAtMs=60_000): BlackjackTable {
  const foundation=createBlackjackTableFoundation({
    tableId:"connection-runtime-table",
    shoe:createUnshuffledBlackjackShoe({
      shoeId:"connection-runtime-shoe",
      createdAtMs:1,
    }),
  });
  const hand: BlackjackHand={
    handId:"connection-hand",
    playerId:"player-1",
    seatNumber:1,
    cards:[foundation.shoe.cards[0],foundation.shoe.cards[1]],
    betCents:1_000,
    status:"ACTIVE",
    origin:"INITIAL",
    splitDepth:0,
    isSplitAce:false,
    isDoubled:false,
    result:null,
    payoutCents:0,
  };
  const round: BlackjackRound={
    roundId:"connection-round",
    roundNumber:1,
    phase:"PLAYER_TURNS",
    activeSeatOrder:[1],
    hands:[hand],
    dealer:{
      cards:[foundation.shoe.cards[2],foundation.shoe.cards[3]],
      holeCardRevealed:false,
    },
    currentTurn:{
      seatNumber:1,
      handId:hand.handId,
      startedAtMs:0,
      endsAtMs:turnEndsAtMs,
    },
    startedAtMs:0,
    bettingClosesAtMs:0,
    finishedAtMs:null,
  };
  return {
    ...foundation,
    phase:"PLAYER_TURNS",
    seats:foundation.seats.map((seat)=>
      seat.seatNumber===1
        ? {...seat,playerId:"player-1"}
        : seat,
    ),
    players:[{
      playerId:"player-1",
      userId:"user-1",
      sessionId:"session-1",
      seatNumber:1,
      status:"PLAYING",
      connected:true,
      disconnectedAtMs:null,
      handIds:[hand.handId],
    }],
    round,
  };
}

function game(){
  const reserved=reserveBlackjackWager(
    createBlackjackWalletLedgerState({
      userId:"user-1",
      totalBalanceCents:100_000,
    }),
    createBlackjackReservationBook("user-1"),
    {
      reservationId:"connection-initial-reservation",
      reserveTransactionId:"connection-initial-reserve-tx",
      userId:"user-1",
      roundId:"connection-round",
      handId:"connection-hand",
      kind:"INITIAL",
      amountCents:1_000,
      createdAtMs:0,
    },
  );

  return new BlackjackPlayerActionCoordinator({
    table:activeTable(),
    accounts:[{
      playerId:"player-1",
      userId:"user-1",
      wallet:reserved.wallet,
      book:reserved.book,
    }],
  });
}

describe("blackjack authoritative connection lifecycle",()=>{
  it("commits disconnect and reconnect as contiguous realtime state",async()=>{
    const coordinator=game();
    const source=createBlackjackCoordinatorRealtimeSource(
      coordinator,
      {nowMs:()=>1_000},
    );
    const published:number[]=[];
    source.subscribe((snapshot)=>published.push(snapshot.eventSequence));

    let persisted=0;
    const lifecycle=createBlackjackRealtimeConnectionLifecycle(
      coordinator,
      source,
      {beforePublish:async()=>{ persisted+=1; }},
    );
    const identity={
      userId:"user-1",
      playerId:"player-1",
      sessionId:"session-1",
    };

    await lifecycle.disconnected(identity,1_000);
    expect(coordinator.getTable().players[0]).toMatchObject({
      status:"DISCONNECTED",
      connected:false,
      disconnectedAtMs:1_000,
    });
    expect(coordinator.getReconnectRegistry().records[0]).toMatchObject({
      previousStatus:"PLAYING",
      expiresAtMs:31_000,
    });

    await lifecycle.connected(identity,20_000);
    expect(coordinator.getTable().players[0]).toMatchObject({
      status:"PLAYING",
      connected:true,
      disconnectedAtMs:null,
    });
    expect(coordinator.getReconnectRegistry().records).toEqual([]);
    expect(persisted).toBe(2);
    expect(published).toEqual([1,2]);
  });

  it("auto-stands at grace expiry before a longer player-turn deadline",async()=>{
    const coordinator=game();
    await coordinator.disconnectPlayerForReconnect("player-1",1_000);

    const tick=await runBlackjackRoundRuntimeTick(coordinator,{
      nowMs:31_000,
    });

    expect(tick.transitions[0]?.type)
      .toBe("DISCONNECTED_AUTO_STAND_COMMITTED");
    expect(tick.status).toBe("ROUND_ENDED");
    expect(coordinator.getReconnectRegistry().records).toEqual([]);
    expect(coordinator.getTable().phase).toBe("ROUND_END");
    expect(coordinator.getTable().round?.hands[0].status).toBe("COMPLETE");
  });

  it("does not disconnect a replacement session when the old socket cleanup fires",async()=>{
    const coordinator=game();
    const source=createBlackjackCoordinatorRealtimeSource(
      coordinator,
      {nowMs:()=>1_000},
    );
    const lifecycle=createBlackjackRealtimeConnectionLifecycle(
      coordinator,
      source,
    );
    const identity={
      userId:"user-1",
      playerId:"player-1",
      sessionId:"session-1",
    };

    await lifecycle.connected(identity,1_000);
    expect(coordinator.getTable().players[0].connected).toBe(true);
  });
});
