import { describe, expect, it } from "vitest";
import {
  buildBlackjackTableViewModelFromSnapshot,
  type BlackjackPublicSnapshotViewSource,
} from "./snapshotView";
import {
  renderBlackjackTableShell,
} from "./tableView";

function ended(input:{
  result:"WIN"|"LOSS"|"PUSH"|"BLACKJACK_WIN";
  betCents:number;
  payoutCents:number;
}): BlackjackPublicSnapshotViewSource {
  return {
    serverTimeMs:20_000,
    tableId:"result-ui-table",
    phase:"ROUND_END",
    maxSeats:5,
    seats:[
      {seatNumber:1,playerId:"local-player"},
      {seatNumber:2,playerId:null},
      {seatNumber:3,playerId:null},
      {seatNumber:4,playerId:null},
      {seatNumber:5,playerId:null},
    ],
    players:[{
      playerId:"local-player",
      seatNumber:1,
      status:"SEATED_WAITING",
      connected:true,
    }],
    round:{
      roundId:"result-round-1",
      phase:"ROUND_END",
      hands:[{
        handId:"result-hand",
        playerId:"local-player",
        seatNumber:1,
        cards:[
          {suit:"HEARTS",rank:"A"},
          {suit:"SPADES",rank:"K"},
        ],
        betCents:input.betCents,
        status:"COMPLETE",
        result:input.result,
        payoutCents:input.payoutCents,
      }],
      dealer:{
        cards:[
          {suit:"CLUBS",rank:"10"},
          {suit:"DIAMONDS",rank:"8"},
        ],
        holeCardRevealed:true,
      },
      currentTurn:null,
      bettingClosesAtMs:null,
    },
    stateVersion:10,
    eventSequence:10,
  };
}

describe("blackjack authoritative round result presentation",()=>{
  it("shows blackjack return and net from settled hand data",()=>{
    const model=buildBlackjackTableViewModelFromSnapshot(
      ended({
        result:"BLACKJACK_WIN",
        betCents:100_000,
        payoutCents:250_000,
      }),
      {
        localPlayerId:"local-player",
        availableBalanceCents:400_000,
      },
    );

    expect(model.roundResult).toEqual({
      title:"BLACKJACK!",
      detail:"RETURN 2,500 · NET +1,500",
      tone:"win",
    });

    const markup=renderBlackjackTableShell(model);
    expect(markup).toContain("BLACKJACK!");
    expect(markup).toContain("RETURN 2,500 · NET +1,500");
    expect(markup).toContain('data-result-tone="win"');
  });

  it("aggregates split-hand payout and distinguishes push/loss",()=>{
    const push=buildBlackjackTableViewModelFromSnapshot(
      ended({
        result:"PUSH",
        betCents:10_000,
        payoutCents:10_000,
      }),
      {localPlayerId:"local-player"},
    );
    expect(push.roundResult).toEqual({
      title:"PUSH",
      detail:"RETURN 100 · NET 0",
      tone:"push",
    });

    const loss=buildBlackjackTableViewModelFromSnapshot(
      ended({
        result:"LOSS",
        betCents:10_000,
        payoutCents:0,
      }),
      {localPlayerId:"local-player"},
    );
    expect(loss.roundResult).toEqual({
      title:"DEALER WINS",
      detail:"RETURN 0 · NET −100",
      tone:"loss",
    });
  });

  it("removes the result immediately when the authoritative next round begins",()=>{
    const prior=ended({
      result:"WIN",
      betCents:10_000,
      payoutCents:20_000,
    });
    expect(
      buildBlackjackTableViewModelFromSnapshot(
        prior,
        {localPlayerId:"local-player"},
      ).roundResult?.title,
    ).toBe("YOU WIN");

    const next: BlackjackPublicSnapshotViewSource={
      ...prior,
      phase:"BETTING",
      round:{
        roundId:"result-round-2",
        phase:"BETTING",
        hands:[],
        dealer:{cards:[],holeCardRevealed:false},
        currentTurn:null,
        bettingClosesAtMs:30_000,
      },
      stateVersion:11,
      eventSequence:11,
    };
    expect(
      buildBlackjackTableViewModelFromSnapshot(
        next,
        {localPlayerId:"local-player"},
      ).roundResult,
    ).toBeNull();
  });
});
