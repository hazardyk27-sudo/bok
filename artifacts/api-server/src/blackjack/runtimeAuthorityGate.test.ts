import { describe, expect, it } from "vitest";
import {
  BlackjackPlayerActionCoordinator,
  type BlackjackCoordinatedAction,
} from "./actionCoordinator";
import { createBlackjackActionProtocolState } from "./actionProtocol";
import type {
  BlackjackCard,
  BlackjackRound,
  BlackjackSeatNumber,
  BlackjackShoe,
  BlackjackTable,
} from "./domain";
import { createBlackjackReconnectRegistry } from "./reconnect";
import { createBlackjackReservationBook } from "./reservations";
import {
  recoverAndStartBlackjackRoundRuntime,
} from "./runtimeRecovery";
import {
  createBlackjackRuntimeAuthority,
} from "./runtimeAuthority";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import {
  createBlackjackDurableSnapshot,
  type BlackjackDurableRuntimeState,
  type BlackjackDurableSnapshot,
} from "./snapshotState";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function gateShoe(): BlackjackShoe {
  const source=createUnshuffledBlackjackShoe({
    shoeId:"full-runtime-gate-shoe",
    createdAtMs:1,
  });
  const cards=[...source.cards];
  const ranks: readonly BlackjackCard["rank"][]=[
    "10","9","8","7","6","10",
    "7","8","9","10","5","6","5",
  ];

  for(let target=0;target<ranks.length;target+=1){
    const index=cards.findIndex(
      (card,candidateIndex)=>
        candidateIndex>=target && card.rank===ranks[target],
    );
    if(index<0) throw new Error("full gate rank missing");
    [cards[target],cards[index]]=[cards[index],cards[target]];
  }

  return {...source,cards};
}

function bettingTable(): BlackjackTable {
  const foundation=createBlackjackTableFoundation({
    tableId:"full-runtime-gate",
    shoe:gateShoe(),
  });
  const players=foundation.seats.map((seat)=>({
    playerId:"gate-player-"+seat.seatNumber,
    userId:"gate-user-"+seat.seatNumber,
    sessionId:"gate-session-"+seat.seatNumber,
    seatNumber:seat.seatNumber,
    status:"BETTING" as const,
    connected:true,
    disconnectedAtMs:null,
    handIds:[] as readonly string[],
  }));
  const round: BlackjackRound={
    roundId:"full-runtime-gate:round-1",
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
    seats:foundation.seats.map((seat)=>({
      ...seat,
      playerId:"gate-player-"+seat.seatNumber,
    })),
    players,
    round,
  };
}

function coordinator(){
  return new BlackjackPlayerActionCoordinator({
    table:bettingTable(),
    accounts:Array.from({length:5},(_,index)=>{
      const seat=index+1;
      const userId="gate-user-"+seat;
      return {
        playerId:"gate-player-"+seat,
        userId,
        wallet:createBlackjackWalletLedgerState({
          userId,
          totalBalanceCents:100_000,
        }),
        book:createBlackjackReservationBook(userId),
      };
    }),
    reconnectRegistry:createBlackjackReconnectRegistry(),
    bettingLimits:{minBetCents:1_000,maxBetCents:null},
  });
}

function durable(
  game: BlackjackPlayerActionCoordinator,
): BlackjackDurableRuntimeState {
  const accounts=game.getAccounts();
  return {
    table:game.getTable(),
    actionProtocol:game.getProtocol(),
    reconnectRegistry:game.getReconnectRegistry(),
    wallets:accounts.map((account)=>account.wallet),
    reservationBooks:accounts.map((account)=>account.book),
    bettingPositions:game.getBettingPositions(),
  };
}

function bettingAction(
  game: BlackjackPlayerActionCoordinator,
  seat: BlackjackSeatNumber,
  type:"PLACE_BET"|"READY",
  actionId:string,
  nowMs:number,
): BlackjackCoordinatedAction {
  const roundId=game.getTable().round?.roundId;
  if(!roundId) throw new Error("gate round missing");

  return {
    envelope:{
      actionId,
      actorPlayerId:"gate-player-"+seat,
      type,
      tableId:"full-runtime-gate",
      expectedStateVersion:game.getTable().stateVersion,
      roundId,
      handId:null,
      seatNumber:seat,
      payloadFingerprint:type+"|"+actionId,
    },
    nowMs,
    ...(type==="PLACE_BET"
      ? {
          chipValueCents:1_000,
          reservationId:"reservation-"+actionId,
          reserveTransactionId:"reserve-"+actionId,
        }
      : {}),
  };
}

describe("blackjack full lifecycle + recovery multiplayer gate",()=>{
  it("runs five players through bet, deal, timeouts, settlement, next round and restart recovery",async()=>{
    const game=coordinator();
    let clock=1_000;
    let stored: BlackjackDurableSnapshot | null=null;
    const published:number[]=[];
    const ordering:string[]=[];

    const authority=createBlackjackRuntimeAuthority(
      game,
      {
        nowMs:()=>clock,
        bettingWindowMs:10_000,
        persist:async(savedAtMs)=>{
          stored=createBlackjackDurableSnapshot(
            durable(game),
            savedAtMs,
          );
        },
      },
    );
    authority.source.subscribe((snapshot)=>{
      published.push(snapshot.eventSequence);
      ordering.push("publish:"+snapshot.eventSequence);
    });

    for(let seat=1;seat<=5;seat+=1){
      for(const type of ["PLACE_BET","READY"] as const){
        clock+=1;
        const action=bettingAction(
          game,
          seat as BlackjackSeatNumber,
          type,
          "round1-"+type.toLowerCase()+"-"+seat,
          clock,
        );
        await authority.handlePlayerActionTransaction(
          action,
          (result)=>{
            ordering.push("ack:"+result.snapshot.eventSequence);
          },
        );
      }
    }

    expect(game.getTable().stateVersion).toBe(10);
    expect(game.getTable().eventSequence).toBe(10);
    expect(game.getBettingPositions()).toHaveLength(5);

    clock=10_000;
    const opening=await authority.driver.tick();
    expect(opening.status).toBe("ROUND_STARTED");
    expect(game.getTable().phase).toBe("PLAYER_TURNS");
    expect(game.getTable().shoe.nextIndex).toBe(12);

    let timedTurns=0;
    while(game.getTable().phase==="PLAYER_TURNS"){
      const turn=game.getTable().round?.currentTurn;
      if(!turn) throw new Error("gate active turn missing");
      clock=turn.endsAtMs;
      await authority.driver.tick();
      timedTurns+=1;
      if(timedTurns>5) throw new Error("gate exceeded five player turns");
    }

    expect(timedTurns).toBe(5);
    expect(game.getTable().phase).toBe("ROUND_END");
    expect(game.getTable().round?.hands.every(
      (hand)=>hand.status==="COMPLETE",
    )).toBe(true);
    expect(game.getTable().round?.dealer.holeCardRevealed).toBe(true);
    expect(game.getTable().shoe.nextIndex).toBe(13);
    expect(game.getAccounts().every(
      (account)=>account.wallet.reservedBalanceCents===0,
    )).toBe(true);

    clock+=1;
    const nextRound=await authority.driver.tick();
    expect(nextRound.status).toBe("NEXT_BETTING_ROUND_STARTED");
    expect(game.getTable()).toMatchObject({
      phase:"BETTING",
      stateVersion:20,
      eventSequence:20,
      round:{
        roundId:"full-runtime-gate:round-2",
        roundNumber:2,
        phase:"BETTING",
      },
    });
    expect(game.getBettingPositions()).toEqual([]);
    expect(published).toEqual(
      Array.from({length:20},(_,index)=>index+1),
    );

    for(let sequence=1;sequence<=10;sequence+=1){
      const ackIndex=ordering.indexOf("ack:"+sequence);
      const publishIndex=ordering.indexOf("publish:"+sequence);
      expect(ackIndex).toBeGreaterThanOrEqual(0);
      expect(publishIndex).toBeGreaterThan(ackIndex);
    }

    expect(stored).not.toBeNull();
    expect(stored?.stateVersion).toBe(20);
    expect(stored?.eventSequence).toBe(20);

    let durableStore=stored!;
    const snapshotRepository={
      load:async()=>durableStore,
      save:async(
        snapshot: BlackjackDurableSnapshot,
        expectedPreviousStateVersion: number | null,
      )=>{
        expect(expectedPreviousStateVersion)
          .toBe(durableStore.stateVersion);
        durableStore=snapshot;
        return snapshot;
      },
    };

    clock+=100;
    const recovered=await recoverAndStartBlackjackRoundRuntime({
      tableId:"full-runtime-gate",
      snapshotRepository,
      journalRepository:{loadAfter:async()=>[]},
      recoveredAtMs:clock,
      nowMs:()=>clock,
      bettingWindowMs:10_000,
      scheduler:{
        schedule:()=> "full-gate-scheduler",
        cancelSchedule:()=>undefined,
      },
    });
    if(!recovered) throw new Error("gate recovery missing");

    expect(recovered.coordinator.getTable().phase).toBe("BETTING");
    expect(recovered.coordinator.getTable().players.every(
      (player)=>player.status==="DISCONNECTED" && !player.connected,
    )).toBe(true);
    expect(recovered.coordinator.getReconnectRegistry().records)
      .toHaveLength(5);

    for(let seat=1;seat<=5;seat+=1){
      clock+=1;
      await recovered.authority.onIdentityConnected(
        {
          userId:"gate-user-"+seat,
          playerId:"gate-player-"+seat,
          sessionId:"gate-session-"+seat,
        },
        clock,
      );
    }

    expect(recovered.coordinator.getTable().players.every(
      (player)=>player.status==="BETTING" && player.connected,
    )).toBe(true);
    expect(recovered.coordinator.getReconnectRegistry().records)
      .toEqual([]);

    clock+=1;
    let round2Ack=0;
    await recovered.authority.handlePlayerActionTransaction(
      bettingAction(
        recovered.coordinator,
        1,
        "PLACE_BET",
        "round2-place-1",
        clock,
      ),
      (result)=>{
        round2Ack=result.snapshot.eventSequence;
      },
    );

    expect(round2Ack).toBe(
      recovered.coordinator.getTable().eventSequence,
    );
    expect(recovered.coordinator.getBettingPosition("gate-player-1"))
      .toMatchObject({
        roundId:"full-runtime-gate:round-2",
        status:"OPEN",
      });
    expect(durableStore.stateVersion)
      .toBe(recovered.coordinator.getTable().stateVersion);
    expect(durableStore.eventSequence)
      .toBe(recovered.coordinator.getTable().eventSequence);
    expect(recovered.authority.fatalError()).toBeNull();

    recovered.stop();
  });

  it("fails closed before ACK or broadcast when action persistence fails",async()=>{
    const game=coordinator();
    let broadcasts=0;
    const authority=createBlackjackRuntimeAuthority(
      game,
      {
        nowMs:()=>1_000,
        persist:async()=>{
          throw new Error("gate persistence failure");
        },
      },
    );
    authority.source.subscribe(()=>{ broadcasts+=1; });

    let acknowledged=false;
    await expect(
      authority.handlePlayerActionTransaction(
        bettingAction(
          game,
          1,
          "PLACE_BET",
          "fatal-bet",
          1_000,
        ),
        ()=>{ acknowledged=true; },
      ),
    ).rejects.toThrow(/gate persistence failure/);

    expect(acknowledged).toBe(false);
    expect(broadcasts).toBe(0);
    expect(authority.fatalError()).toBeInstanceOf(Error);
    await expect(authority.source.getSnapshot()).rejects.toThrow(
      /fail-closed/,
    );
  });
});
