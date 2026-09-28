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

function table(): BlackjackTable {
  const foundation=createBlackjackTableFoundation({
    tableId:"close-table",
    shoe:createUnshuffledBlackjackShoe({
      shoeId:"close-shoe",
      createdAtMs:1,
    }),
  });
  const round: BlackjackRound={
    roundId:"close-round",
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
        playerId:"p1",
        userId:"u1",
        wallet:createBlackjackWalletLedgerState({
          userId:"u1",
          totalBalanceCents:500_000,
        }),
        book:createBlackjackReservationBook("u1"),
      },
      {
        playerId:"p3",
        userId:"u3",
        wallet:createBlackjackWalletLedgerState({
          userId:"u3",
          totalBalanceCents:500_000,
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
      tableId:"close-table",
      expectedStateVersion:input.expectedStateVersion,
      roundId:"close-round",
      handId:null,
      seatNumber:input.seatNumber,
      payloadFingerprint:input.type+"|"+input.actionId,
    },
    nowMs:9_000,
    ...(input.type==="PLACE_BET"
      ? {
          chipValueCents:input.chipValueCents ?? 1_000,
          reservationId:"r-"+input.actionId,
          reserveTransactionId:"tx-"+input.actionId,
        }
      : {}),
  };
}

describe("blackjack betting-window close orchestration",()=>{
  it("locks READY bets in seat order and refunds OPEN unready reservations",async()=>{
    const game=coordinator();

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

    expect(game.getAccount("p3").wallet.reservedBalanceCents).toBe(25_000);

    const closed=await game.closeBettingWindow(10_000);

    expect(closed.replayed).toBe(false);
    expect(closed.participants).toEqual([
      {playerId:"p1",seatNumber:1,betCents:100_000},
    ]);
    expect(game.getTable().phase).toBe("BETTING_LOCKED");
    expect(game.getTable().round?.phase).toBe("BETTING_LOCKED");
    expect(game.getTable().stateVersion).toBe(4);
    expect(game.getTable().eventSequence).toBe(4);
    expect(game.getBettingPosition("p1")?.status).toBe("LOCKED");
    expect(game.getAccount("p1").wallet.reservedBalanceCents).toBe(100_000);

    expect(game.getAccount("p3").wallet.reservedBalanceCents).toBe(0);
    expect(game.getAccount("p3").wallet.availableBalanceCents).toBe(500_000);
    expect(
      game.getBettingPosition("p3")?.chips.every(
        (chip)=>chip.status==="RELEASED",
      ),
    ).toBe(true);
    expect(game.getTable().players.find((p)=>p.playerId==="p3")?.status)
      .toBe("SEATED_WAITING");
  });

  it("refuses to close before deadline and is idempotent after locking",async()=>{
    const game=coordinator();
    await game.submit(action({
      playerId:"p1",seatNumber:1,type:"PLACE_BET",
      actionId:"bet",expectedStateVersion:0,
    }));
    await game.submit(action({
      playerId:"p1",seatNumber:1,type:"READY",
      actionId:"ready",expectedStateVersion:1,
    }));

    await expect(game.closeBettingWindow(9_999)).rejects.toThrow(/still open/);
    expect(game.getTable().phase).toBe("BETTING");

    const first=await game.closeBettingWindow(10_000);
    const second=await game.closeBettingWindow(10_500);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.table).toBe(first.table);
    expect(second.participants).toEqual(first.participants);
    expect(game.getTable().stateVersion).toBe(3);
    expect(game.getTable().eventSequence).toBe(3);
  });

  it("serializes a final pre-deadline READY action before the queued close",async()=>{
    const game=coordinator();
    await game.submit(action({
      playerId:"p1",seatNumber:1,type:"PLACE_BET",
      actionId:"bet-race",expectedStateVersion:0,
    }));

    const ready=game.submit(action({
      playerId:"p1",seatNumber:1,type:"READY",
      actionId:"ready-race",expectedStateVersion:1,
    }));
    const close=game.closeBettingWindow(10_000);

    await expect(ready).resolves.toMatchObject({replayed:false});
    await expect(close).resolves.toMatchObject({
      participants:[{playerId:"p1",seatNumber:1,betCents:1_000}],
    });
    expect(game.getBettingPosition("p1")?.status).toBe("LOCKED");
  });
});
