import { describe, expect, it } from "vitest";
import {
  BlackjackPlayerActionCoordinator,
} from "./actionCoordinator";
import type {
  BlackjackHand,
  BlackjackRound,
  BlackjackTable,
} from "./domain";
import { createBlackjackReservationBook } from "./reservations";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function completeHand(playerId:string): BlackjackHand {
  return {
    handId:"round-1:seat-1:initial",
    playerId,
    seatNumber:1,
    cards:[],
    betCents:1_000,
    status:"COMPLETE",
    origin:"INITIAL",
    splitDepth:0,
    isSplitAce:false,
    isDoubled:false,
    result:"PUSH",
    payoutCents:1_000,
  };
}

function roundEndTable(input?:{
  connected?:boolean;
  reshufflePending?:boolean;
}): BlackjackTable {
  const foundation=createBlackjackTableFoundation({
    tableId:"next-round-table",
    shoe:{
      ...createUnshuffledBlackjackShoe({
        shoeId:"next-round-shoe",
        createdAtMs:1,
      }),
      reshufflePending:input?.reshufflePending ?? false,
    },
  });
  const connected=input?.connected ?? true;
  const playerId="player-1";
  const round: BlackjackRound={
    roundId:"round-1",
    roundNumber:1,
    phase:"ROUND_END",
    activeSeatOrder:[1],
    hands:[completeHand(playerId)],
    dealer:{cards:[],holeCardRevealed:true},
    currentTurn:null,
    startedAtMs:0,
    bettingClosesAtMs:10_000,
    finishedAtMs:20_000,
  };
  return {
    ...foundation,
    phase:"ROUND_END",
    seats:foundation.seats.map((seat)=>
      seat.seatNumber===1 ? {...seat,playerId} : seat,
    ),
    players:[{
      playerId,
      userId:"user-1",
      sessionId:"session-1",
      seatNumber:1,
      status:connected ? "SEATED_WAITING" : "DISCONNECTED",
      connected,
      disconnectedAtMs:connected ? null : 20_000,
      handIds:[],
    }],
    round,
    stateVersion:7,
    eventSequence:7,
  };
}

function coordinator(table: BlackjackTable){
  return new BlackjackPlayerActionCoordinator({
    table,
    accounts:[{
      playerId:"player-1",
      userId:"user-1",
      wallet:createBlackjackWalletLedgerState({
        userId:"user-1",
        totalBalanceCents:100_000,
      }),
      book:createBlackjackReservationBook("user-1"),
    }],
  });
}

describe("blackjack next betting round lifecycle",()=>{
  it("opens the next numbered betting round and resets connected players",async()=>{
    const game=coordinator(roundEndTable());

    const next=await game.startNextBettingRound(21_000);

    expect(next.replayed).toBe(false);
    expect(game.getTable()).toMatchObject({
      phase:"BETTING",
      stateVersion:8,
      eventSequence:8,
      round:{
        roundId:"next-round-table:round-2",
        roundNumber:2,
        phase:"BETTING",
        startedAtMs:21_000,
        bettingClosesAtMs:31_000,
        finishedAtMs:null,
      },
    });
    expect(game.getTable().round?.hands).toEqual([]);
    expect(game.getTable().round?.dealer.cards).toEqual([]);
    expect(game.getTable().players[0]).toMatchObject({
      status:"BETTING",
      handIds:[],
    });
  });

  it("uses a fresh shoe before betting when the prior shoe is pending reshuffle",async()=>{
    const game=coordinator(roundEndTable({reshufflePending:true}));
    const fresh=createUnshuffledBlackjackShoe({
      shoeId:"fresh-next-round-shoe",
      createdAtMs:21_000,
    });

    await expect(game.startNextBettingRound(21_000)).rejects.toThrow(
      /requires a fresh shoe/,
    );
    expect(game.getTable().phase).toBe("ROUND_END");

    await game.startNextBettingRound(21_000,{
      createFreshShoe:()=>fresh,
    });
    expect(game.getTable().phase).toBe("BETTING");
    expect(game.getTable().shoe.shoeId).toBe("fresh-next-round-shoe");
    expect(game.getTable().shoe.nextIndex).toBe(0);
  });

  it("does not open a new round when no connected player remains",async()=>{
    const game=coordinator(roundEndTable({connected:false}));
    const before=game.getTable();

    const next=await game.startNextBettingRound(21_000);

    expect(next.replayed).toBe(true);
    expect(next.table).toBe(before);
    expect(game.getTable().phase).toBe("ROUND_END");
    expect(game.getTable().stateVersion).toBe(7);
    expect(game.getTable().eventSequence).toBe(7);
  });

  it("is idempotent after the next betting round has opened",async()=>{
    const game=coordinator(roundEndTable());

    const first=await game.startNextBettingRound(21_000,{
      bettingWindowMs:15_000,
    });
    const replay=await game.startNextBettingRound(22_000,{
      bettingWindowMs:99_000,
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.table).toBe(first.table);
    expect(game.getTable().round?.bettingClosesAtMs).toBe(36_000);
    expect(game.getTable().stateVersion).toBe(8);
    expect(game.getTable().eventSequence).toBe(8);
  });
});
