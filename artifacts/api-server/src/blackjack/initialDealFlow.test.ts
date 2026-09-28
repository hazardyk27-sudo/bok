import { describe, expect, it } from "vitest";
import {
  BlackjackPlayerActionCoordinator,
  type BlackjackCoordinatedAction,
} from "./actionCoordinator";
import type {
  BlackjackCard,
  BlackjackRound,
  BlackjackShoe,
  BlackjackTable,
} from "./domain";
import { createBlackjackReservationBook } from "./reservations";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function riggedShoe(): BlackjackShoe {
  const source=createUnshuffledBlackjackShoe({
    shoeId:"initial-flow-shoe",
    createdAtMs:1,
  });
  const cards=[...source.cards];

  const ranks: BlackjackCard["rank"][]=[
    "10","9","10","6","7","8",
  ];
  for(let target=0;target<ranks.length;target+=1){
    const rank=ranks[target];
    const index=cards.findIndex(
      (card,candidateIndex)=>
        candidateIndex>=target && card.rank===rank,
    );
    if(index<0) throw new Error("required rigged rank missing");
    [cards[target],cards[index]]=[cards[index],cards[target]];
  }

  return {...source,cards};
}

function table(): BlackjackTable {
  const foundation=createBlackjackTableFoundation({
    tableId:"initial-flow-table",
    shoe:riggedShoe(),
  });
  const round: BlackjackRound={
    roundId:"initial-flow-round",
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
      seat.seatNumber===1
        ? {...seat,playerId:"p1"}
        : seat.seatNumber===3
          ? {...seat,playerId:"p3"}
          : seat,
    ),
    players:[
      {
        playerId:"p1",userId:"u1",sessionId:"s1",seatNumber:1,
        status:"BETTING",connected:true,disconnectedAtMs:null,handIds:[],
      },
      {
        playerId:"p3",userId:"u3",sessionId:"s3",seatNumber:3,
        status:"BETTING",connected:true,disconnectedAtMs:null,handIds:[],
      },
    ],
    round,
  };
}

function coordinator(){
  return new BlackjackPlayerActionCoordinator({
    table:table(),
    accounts:[
      {
        playerId:"p1",userId:"u1",
        wallet:createBlackjackWalletLedgerState({
          userId:"u1",totalBalanceCents:500_000,
        }),
        book:createBlackjackReservationBook("u1"),
      },
      {
        playerId:"p3",userId:"u3",
        wallet:createBlackjackWalletLedgerState({
          userId:"u3",totalBalanceCents:500_000,
        }),
        book:createBlackjackReservationBook("u3"),
      },
    ],
    bettingLimits:{minBetCents:1_000,maxBetCents:null},
  });
}

function action(input:{
  playerId:"p1"|"p3";
  seatNumber:1|3;
  type:"PLACE_BET"|"READY";
  actionId:string;
  expectedStateVersion:number;
  chipValueCents?:number;
}): BlackjackCoordinatedAction {
  return {
    envelope:{
      actionId:input.actionId,
      actorPlayerId:input.playerId,
      type:input.type,
      tableId:"initial-flow-table",
      expectedStateVersion:input.expectedStateVersion,
      roundId:"initial-flow-round",
      handId:null,
      seatNumber:input.seatNumber,
      payloadFingerprint:input.type+"|"+input.actionId,
    },
    nowMs:9_000,
    ...(input.type==="PLACE_BET"
      ? {
          chipValueCents:input.chipValueCents ?? 1_000,
          reservationId:"reservation-"+input.actionId,
          reserveTransactionId:"reserve-"+input.actionId,
        }
      : {}),
  };
}

async function readyTwoPlayers(
  game: BlackjackPlayerActionCoordinator,
): Promise<void> {
  await game.submit(action({
    playerId:"p1",seatNumber:1,type:"PLACE_BET",
    actionId:"p1-bet",expectedStateVersion:0,chipValueCents:100_000,
  }));
  await game.submit(action({
    playerId:"p1",seatNumber:1,type:"READY",
    actionId:"p1-ready",expectedStateVersion:1,
  }));
  await game.submit(action({
    playerId:"p3",seatNumber:3,type:"PLACE_BET",
    actionId:"p3-bet",expectedStateVersion:2,chipValueCents:25_000,
  }));
  await game.submit(action({
    playerId:"p3",seatNumber:3,type:"READY",
    actionId:"p3-ready",expectedStateVersion:3,
  }));
}

describe("blackjack locked-bet initial-deal flow",()=>{
  it("deals 2N+2 cards from the shared shoe and starts the first playable turn",async()=>{
    const game=coordinator();
    await readyTwoPlayers(game);
    await game.closeBettingWindow(10_000);

    const beforeIndex=game.getTable().shoe.nextIndex;
    const dealt=await game.startInitialDeal(10_001);
    const current=game.getTable();

    expect(dealt.replayed).toBe(false);
    expect(dealt.participants).toEqual([
      {playerId:"p1",seatNumber:1,betCents:100_000},
      {playerId:"p3",seatNumber:3,betCents:25_000},
    ]);
    expect(dealt.dealEvents.map((event)=>
      event.recipient==="PLAYER"
        ? `P${event.seatNumber}-${event.pass}`
        : `D-${event.pass}`,
    )).toEqual([
      "P1-1","P3-1","D-1","P1-2","P3-2","D-2",
    ]);

    expect(current.shoe.nextIndex).toBe(beforeIndex+6);
    expect(current.phase).toBe("PLAYER_TURNS");
    expect(current.round?.phase).toBe("PLAYER_TURNS");
    expect(current.round?.activeSeatOrder).toEqual([1,3]);
    expect(current.round?.currentTurn).toEqual({
      seatNumber:1,
      handId:"initial-flow-round:seat-1:initial",
      startedAtMs:10_001,
      endsAtMs:25_001,
    });
    expect(current.round?.hands.map((hand)=>({
      seatNumber:hand.seatNumber,
      betCents:hand.betCents,
      cards:hand.cards.map((card)=>card.rank),
      status:hand.status,
    }))).toEqual([
      {seatNumber:1,betCents:100_000,cards:["10","6"],status:"ACTIVE"},
      {seatNumber:3,betCents:25_000,cards:["9","7"],status:"WAITING"},
    ]);
    expect(current.round?.dealer.cards.map((card)=>card.rank))
      .toEqual(["10","8"]);
    expect(current.stateVersion).toBe(6);
    expect(current.eventSequence).toBe(6);
  });

  it("binds each initial reservation to its deterministic hand and updates player hand ownership",async()=>{
    const game=coordinator();
    await readyTwoPlayers(game);
    await game.closeBettingWindow(10_000);
    await game.startInitialDeal(10_001);

    expect(game.getAccount("p1").book.reservations[0].handId)
      .toBe("initial-flow-round:seat-1:initial");
    expect(game.getAccount("p3").book.reservations[0].handId)
      .toBe("initial-flow-round:seat-3:initial");

    expect(game.getTable().players.map((player)=>({
      playerId:player.playerId,
      status:player.status,
      handIds:player.handIds,
    }))).toEqual([
      {
        playerId:"p1",
        status:"PLAYING",
        handIds:["initial-flow-round:seat-1:initial"],
      },
      {
        playerId:"p3",
        status:"PLAYING",
        handIds:["initial-flow-round:seat-3:initial"],
      },
    ]);
  });

  it("is idempotent after the initial deal and never consumes the shoe twice",async()=>{
    const game=coordinator();
    await readyTwoPlayers(game);
    await game.closeBettingWindow(10_000);

    const first=await game.startInitialDeal(10_001);
    const afterFirstIndex=game.getTable().shoe.nextIndex;
    const stateVersion=game.getTable().stateVersion;
    const eventSequence=game.getTable().eventSequence;

    const replay=await game.startInitialDeal(10_100);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.dealEvents).toEqual([]);
    expect(game.getTable().shoe.nextIndex).toBe(afterFirstIndex);
    expect(game.getTable().stateVersion).toBe(stateVersion);
    expect(game.getTable().eventSequence).toBe(eventSequence);
  });

  it("does not deal when no player locked a READY bet",async()=>{
    const game=coordinator();
    await game.closeBettingWindow(10_000);

    await expect(game.startInitialDeal(10_001)).rejects.toThrow(
      /at least one locked betting participant/,
    );
    expect(game.getTable().phase).toBe("BETTING_LOCKED");
    expect(game.getTable().shoe.nextIndex).toBe(0);
  });

  it("requires a fresh six-deck shoe before dealing when reshuffle is pending",async()=>{
    const source=table();
    const game=new BlackjackPlayerActionCoordinator({
      table:{
        ...source,
        shoe:{...source.shoe,reshufflePending:true},
      },
      accounts:[
        {
          playerId:"p1",userId:"u1",
          wallet:createBlackjackWalletLedgerState({
            userId:"u1",totalBalanceCents:500_000,
          }),
          book:createBlackjackReservationBook("u1"),
        },
        {
          playerId:"p3",userId:"u3",
          wallet:createBlackjackWalletLedgerState({
            userId:"u3",totalBalanceCents:500_000,
          }),
          book:createBlackjackReservationBook("u3"),
        },
      ],
      bettingLimits:{minBetCents:1_000,maxBetCents:null},
    });

    await readyTwoPlayers(game);
    await game.closeBettingWindow(10_000);

    await expect(game.startInitialDeal(10_001)).rejects.toThrow(
      /requires a fresh shoe/,
    );

    const fresh=createUnshuffledBlackjackShoe({
      shoeId:"fresh-initial-flow-shoe",
      createdAtMs:10_001,
    });
    const dealt=await game.startInitialDeal(
      10_001,
      ()=>fresh,
    );

    expect(dealt.replayed).toBe(false);
    expect(game.getTable().shoe.shoeId).toBe("fresh-initial-flow-shoe");
    expect(game.getTable().shoe.nextIndex).toBe(6);
    expect(game.getTable().shoe.reshufflePending).toBe(false);
  });

});
