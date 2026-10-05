import { describe, expect, it } from "vitest";
import {
  BlackjackPlayerActionCoordinator,
  type BlackjackCoordinatedAction,
} from "./actionCoordinator";
import type { BlackjackRound, BlackjackTable } from "./domain";
import { createBlackjackReservationBook } from "./reservations";
import { createBlackjackRuntimeAuthority } from "./runtimeAuthority";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function bettingGame():BlackjackPlayerActionCoordinator{
  const foundation=createBlackjackTableFoundation({
    tableId:"undo-wallet-table",
    shoe:createUnshuffledBlackjackShoe({
      shoeId:"undo-wallet-shoe",
      createdAtMs:1,
    }),
  });
  const round:BlackjackRound={
    roundId:"undo-wallet-table:round-1",
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
  const table:BlackjackTable={
    ...foundation,
    phase:"BETTING",
    seats:foundation.seats.map((seat)=>
      seat.seatNumber===3
        ? {...seat,playerId:"undo-wallet-player"}
        : seat,
    ),
    players:[{
      playerId:"undo-wallet-player",
      userId:"undo-wallet-user",
      sessionId:"undo-wallet-session",
      seatNumber:3,
      status:"BETTING",
      connected:true,
      disconnectedAtMs:null,
      handIds:[],
    }],
    round,
  };

  return new BlackjackPlayerActionCoordinator({
    table,
    accounts:[{
      playerId:"undo-wallet-player",
      userId:"undo-wallet-user",
      wallet:createBlackjackWalletLedgerState({
        userId:"undo-wallet-user",
        totalBalanceCents:100_000,
      }),
      book:createBlackjackReservationBook("undo-wallet-user"),
    }],
    bettingLimits:{minBetCents:1_000,maxBetCents:null},
  });
}

function action(
  game:BlackjackPlayerActionCoordinator,
  type:"PLACE_BET"|"UNDO_BET",
  actionId:string,
  nowMs:number,
):BlackjackCoordinatedAction{
  const roundId=game.getTable().round?.roundId;
  if(!roundId) throw new Error("Blackjack undo wallet test round missing");

  return {
    envelope:{
      type,
      actionId,
      actorPlayerId:"undo-wallet-player",
      tableId:"undo-wallet-table",
      expectedStateVersion:game.getTable().stateVersion,
      roundId,
      handId:null,
      seatNumber:3,
      payloadFingerprint:type+"|"+actionId,
    },
    nowMs,
    ...(type==="PLACE_BET"
      ? {
          chipValueCents:1_000,
          reservationId:"reservation-"+actionId,
          reserveTransactionId:"reserve-"+actionId,
        }
      : {
          releaseTransactionId:"release-"+actionId,
        }),
  };
}

describe("blackjack authoritative wager undo wallet refresh",()=>{
  it("rebases from shared available balance before releasing the last chip",async()=>{
    const game=bettingGame();
    let externalAvailable=100_000;
    const loads:string[]=[];
    const authority=createBlackjackRuntimeAuthority(game,{
      nowMs:()=>1_000,
      persist:async()=>undefined,
      loadAvailableBalanceCents:async(userId)=>{
        loads.push(userId);
        return externalAvailable;
      },
    });

    await authority.handlePlayerActionTransaction(
      action(game,"PLACE_BET","place-1",1_000),
      ()=>undefined,
    );
    expect(game.getAccount("undo-wallet-player").wallet).toMatchObject({
      availableBalanceCents:99_000,
      reservedBalanceCents:1_000,
    });

    externalAvailable=80_000;
    await authority.handlePlayerActionTransaction(
      action(game,"UNDO_BET","undo-1",1_001),
      ()=>undefined,
    );

    expect(loads).toEqual([
      "undo-wallet-user",
      "undo-wallet-user",
    ]);
    expect(game.getAccount("undo-wallet-player").wallet).toMatchObject({
      availableBalanceCents:81_000,
      reservedBalanceCents:0,
    });
    expect(game.getBettingPosition("undo-wallet-player")).toMatchObject({
      status:"OPEN",
    });
  });
});