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

function naturalCoordinator(){
  const source=bettingTable();
  const cards=[...source.shoe.cards];
  const openingRanks=["A","9","K","7"] as const;

  for(let target=0;target<openingRanks.length;target+=1){
    const index=cards.findIndex(
      (card,candidateIndex)=>
        candidateIndex>=target &&
        card.rank===openingRanks[target],
    );
    if(index<0) throw new Error("natural opening rank missing");
    [cards[target],cards[index]]=[cards[index],cards[target]];
  }

  return new BlackjackPlayerActionCoordinator({
    table:{
      ...source,
      shoe:{...source.shoe,cards},
    },
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

  it("waits before an active player turn deadline without mutation",async()=>{
    const game=coordinator();
    await game.submit(action("PLACE_BET","bet-timeout",0));
    await game.submit(action("READY","ready-timeout",1));
    await runBlackjackRoundRuntimeTick(game,{nowMs:10_000});

    const turn=game.getTable().round?.currentTurn;
    expect(turn).not.toBeNull();
    const beforeVersion=game.getTable().stateVersion;
    const beforeSequence=game.getTable().eventSequence;

    const tick=await runBlackjackRoundRuntimeTick(game,{
      nowMs:(turn?.endsAtMs ?? 0)-1,
    });

    expect(tick.status).toBe("WAITING_FOR_PLAYER_TURN");
    expect(tick.transitions).toEqual([]);
    expect(game.getTable().stateVersion).toBe(beforeVersion);
    expect(game.getTable().eventSequence).toBe(beforeSequence);
  });

  it("auto-stands exactly at timeout and commits the dealer handoff once",async()=>{
    const game=coordinator();
    await game.submit(action("PLACE_BET","bet-auto-stand",0));
    await game.submit(action("READY","ready-auto-stand",1));
    await runBlackjackRoundRuntimeTick(game,{nowMs:10_000});

    const turn=game.getTable().round?.currentTurn;
    expect(turn).not.toBeNull();
    const timeoutAt=turn!.endsAtMs;
    const beforeVersion=game.getTable().stateVersion;
    const beforeSequence=game.getTable().eventSequence;

    const tick=await runBlackjackRoundRuntimeTick(game,{
      nowMs:timeoutAt,
    });

    expect(tick.status).toBe("ROUND_ENDED");
    expect(tick.transitions.map((transition)=>transition.type)).toEqual([
      "PLAYER_TURN_TIMEOUT_COMMITTED",
      "DEALER_TURN_COMMITTED",
      "ROUND_SETTLED",
    ]);
    expect(game.getTable().phase).toBe("ROUND_END");
    expect(game.getTable().round?.currentTurn).toBeNull();
    expect(game.getTable().round?.hands[0].status).toBe("COMPLETE");
    expect(game.getTable().round?.dealer.holeCardRevealed).toBe(true);
    expect(game.getTable().stateVersion).toBe(beforeVersion+3);
    expect(game.getTable().eventSequence).toBe(beforeSequence+3);
    expect(game.getAccount("player-2").wallet.reservedBalanceCents).toBe(0);

    const replay=await runBlackjackRoundRuntimeTick(game,{
      nowMs:timeoutAt+1,
    });
    expect(replay.status).toBe("NOOP");
    expect(replay.transitions).toEqual([]);
  });


  it("resumes from DEALER_TURN and settles the round without replaying player state",async()=>{
    const game=coordinator();
    await game.submit(action("PLACE_BET","bet-dealer",0));
    await game.submit(action("READY","ready-dealer",1));
    await runBlackjackRoundRuntimeTick(game,{nowMs:10_000});

    const turn=game.getTable().round?.currentTurn;
    expect(turn).not.toBeNull();

    await game.timeoutCurrentTurn(turn!.endsAtMs);
    expect(game.getTable().phase).toBe("DEALER_TURN");
    const beforeVersion=game.getTable().stateVersion;
    const beforeSequence=game.getTable().eventSequence;

    const tick=await runBlackjackRoundRuntimeTick(game,{
      nowMs:turn!.endsAtMs+1,
    });

    expect(tick.status).toBe("ROUND_ENDED");
    expect(tick.transitions.map((transition)=>transition.type)).toEqual([
      "DEALER_TURN_COMMITTED",
      "ROUND_SETTLED",
    ]);
    expect(game.getTable().phase).toBe("ROUND_END");
    expect(game.getTable().stateVersion).toBe(beforeVersion+2);
    expect(game.getTable().eventSequence).toBe(beforeSequence+2);
    expect(game.getTable().round?.hands.every(
      (hand)=>hand.status==="COMPLETE",
    )).toBe(true);
    expect(game.getAccount("player-2").wallet.reservedBalanceCents).toBe(0);
    expect(
      game.getAccount("player-2").book.reservations.every(
        (reservation)=>reservation.status==="SETTLED",
      ),
    ).toBe(true);
  });


  it("finishes a terminal natural opening through dealer and settlement in the same deadline tick",async()=>{
    const game=naturalCoordinator();
    await game.submit(action("PLACE_BET","bet-natural",0));
    await game.submit(action("READY","ready-natural",1));

    const tick=await runBlackjackRoundRuntimeTick(game,{nowMs:10_000});

    expect(tick.status).toBe("ROUND_ENDED");
    expect(tick.transitions.map((transition)=>transition.type)).toEqual([
      "BETTING_LOCKED",
      "INITIAL_DEAL_COMMITTED",
      "DEALER_TURN_COMMITTED",
      "ROUND_SETTLED",
    ]);
    expect(tick.transitions.map((transition)=>transition.table.eventSequence))
      .toEqual([3,4,5,6]);
    expect(game.getTable().phase).toBe("ROUND_END");
    expect(game.getTable().round?.hands[0]).toMatchObject({
      status:"COMPLETE",
      result:"BLACKJACK_WIN",
      payoutCents:2_500,
    });
    expect(game.getAccount("player-2").wallet.reservedBalanceCents).toBe(0);
    expect(game.getAccount("player-2").wallet.availableBalanceCents)
      .toBe(101_500);
  });


  it("opens the next betting round on the tick after ROUND_END and accepts a fresh bet",async()=>{
    const game=coordinator();
    await game.submit(action("PLACE_BET","cycle-bet-1",0));
    await game.submit(action("READY","cycle-ready-1",1));

    await runBlackjackRoundRuntimeTick(game,{nowMs:10_000});
    const turn=game.getTable().round?.currentTurn;
    expect(turn).not.toBeNull();

    const settled=await runBlackjackRoundRuntimeTick(game,{
      nowMs:turn!.endsAtMs,
    });
    expect(settled.status).toBe("ROUND_ENDED");
    expect(game.getTable().phase).toBe("ROUND_END");
    const roundOneEndVersion=game.getTable().stateVersion;
    const roundOneEndSequence=game.getTable().eventSequence;

    const next=await runBlackjackRoundRuntimeTick(game,{
      nowMs:turn!.endsAtMs+1,
      bettingWindowMs:12_000,
    });

    expect(next.status).toBe("NEXT_BETTING_ROUND_STARTED");
    expect(next.transitions.map((transition)=>transition.type)).toEqual([
      "NEXT_BETTING_ROUND_COMMITTED",
    ]);
    expect(game.getTable()).toMatchObject({
      phase:"BETTING",
      stateVersion:roundOneEndVersion+1,
      eventSequence:roundOneEndSequence+1,
      round:{
        roundId:"round-runtime-table:round-2",
        roundNumber:2,
        phase:"BETTING",
        startedAtMs:turn!.endsAtMs+1,
        bettingClosesAtMs:turn!.endsAtMs+12_001,
      },
    });
    expect(game.getBettingPosition("player-2")).toBeNull();

    const freshBet=await game.submit({
      envelope:{
        actionId:"cycle-bet-2",
        actorPlayerId:"player-2",
        type:"PLACE_BET",
        tableId:"round-runtime-table",
        expectedStateVersion:game.getTable().stateVersion,
        roundId:"round-runtime-table:round-2",
        handId:null,
        seatNumber:2,
        payloadFingerprint:"PLACE_BET|cycle-bet-2",
      },
      nowMs:turn!.endsAtMs+2,
      chipValueCents:1_000,
      reservationId:"reservation-cycle-bet-2",
      reserveTransactionId:"reserve-cycle-bet-2",
    });

    expect(freshBet.betting).toMatchObject({
      roundId:"round-runtime-table:round-2",
      status:"OPEN",
      betCents:1_000,
    });
  });

  it("keeps ROUND_END stable when no connected player remains",async()=>{
    const game=coordinator();
    await game.submit(action("PLACE_BET","idle-bet",0));
    await game.submit(action("READY","idle-ready",1));
    await runBlackjackRoundRuntimeTick(game,{nowMs:10_000});
    const turn=game.getTable().round?.currentTurn;
    expect(turn).not.toBeNull();

    await runBlackjackRoundRuntimeTick(game,{nowMs:turn!.endsAtMs});
    const ended=game.getTable();
    const disconnected={
      ...ended,
      players:ended.players.map((player)=>({
        ...player,
        connected:false,
        status:"DISCONNECTED" as const,
        disconnectedAtMs:turn!.endsAtMs,
      })),
    };

    const replacement=new BlackjackPlayerActionCoordinator({
      table:disconnected,
      accounts:[game.getAccount("player-2")],
      bettingPositions:[
        game.getBettingPosition("player-2"),
      ].filter((value): value is NonNullable<typeof value>=>value!==null),
      protocol:game.getProtocol(),
    });

    const tick=await runBlackjackRoundRuntimeTick(replacement,{
      nowMs:turn!.endsAtMs+1,
    });
    expect(tick.status).toBe("ROUND_END_IDLE");
    expect(tick.transitions).toEqual([]);
    expect(replacement.getTable().phase).toBe("ROUND_END");
  });

});
