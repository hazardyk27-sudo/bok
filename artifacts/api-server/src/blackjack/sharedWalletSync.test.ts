import { describe, expect, it } from "vitest";
import { createBlackjackActionProtocolState } from "./actionProtocol";
import { createBlackjackReconnectRegistry } from "./reconnect";
import { createBlackjackReservationBook } from "./reservations";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import {
  createBlackjackDurableSnapshot,
  type BlackjackDurableRuntimeState,
} from "./snapshotState";
import {
  rebaseBlackjackSnapshotAgainstSharedWallets,
} from "./sharedWalletSync";
import {
  createBlackjackWalletLedgerState,
} from "./walletLedger";

function runtime(balanceCents:number): BlackjackDurableRuntimeState {
  return {
    table:createBlackjackTableFoundation({
      tableId:"shared-wallet-sync",
      shoe:createUnshuffledBlackjackShoe({
        shoeId:"shared-wallet-sync-shoe",
        createdAtMs:1,
      }),
    }),
    actionProtocol:createBlackjackActionProtocolState(),
    reconnectRegistry:createBlackjackReconnectRegistry(),
    wallets:[createBlackjackWalletLedgerState({
      userId:"user-1",
      totalBalanceCents:balanceCents,
    })],
    reservationBooks:[createBlackjackReservationBook("user-1")],
    bettingPositions:[],
  };
}

describe("blackjack shared-wallet delta synchronization",()=>{
  it("preserves an external deposit and applies only the Blackjack debit",()=>{
    const previous=createBlackjackDurableSnapshot(runtime(100_000),1);
    const candidate=createBlackjackDurableSnapshot(runtime(90_000),2);

    const result=rebaseBlackjackSnapshotAgainstSharedWallets({
      previous,
      candidate,
      sharedBalances:new Map([["user-1",150_000]]),
    });

    expect(result.mutations[0]).toMatchObject({
      sharedBalanceBeforeCents:150_000,
      deltaCents:-10_000,
      sharedBalanceAfterCents:140_000,
    });
    expect(
      result.snapshot.payload.wallets[0].availableBalanceCents,
    ).toBe(140_000);
  });

  it("preserves an external spend and applies only the Blackjack payout",()=>{
    const previous=createBlackjackDurableSnapshot(runtime(100_000),1);
    const candidate=createBlackjackDurableSnapshot(runtime(125_000),2);

    const result=rebaseBlackjackSnapshotAgainstSharedWallets({
      previous,
      candidate,
      sharedBalances:new Map([["user-1",70_000]]),
    });

    expect(result.mutations[0]).toMatchObject({
      sharedBalanceBeforeCents:70_000,
      deltaCents:25_000,
      sharedBalanceAfterCents:95_000,
    });
    expect(
      result.snapshot.payload.wallets[0].availableBalanceCents,
    ).toBe(95_000);
  });

  it("uses the locked shared balance as the baseline for a newly seated account",()=>{
    const candidate=createBlackjackDurableSnapshot(runtime(100_000),1);
    const result=rebaseBlackjackSnapshotAgainstSharedWallets({
      previous:null,
      candidate,
      sharedBalances:new Map([["user-1",175_000]]),
    });

    expect(result.mutations[0]).toMatchObject({
      previousSnapshotBalanceCents:null,
      deltaCents:0,
      sharedBalanceAfterCents:175_000,
    });
    expect(
      result.snapshot.payload.wallets[0].availableBalanceCents,
    ).toBe(175_000);
  });

  it("rejects a debit that would overdraw the latest shared balance",()=>{
    const previous=createBlackjackDurableSnapshot(runtime(100_000),1);
    const candidate=createBlackjackDurableSnapshot(runtime(60_000),2);

    expect(()=>rebaseBlackjackSnapshotAgainstSharedWallets({
      previous,
      candidate,
      sharedBalances:new Map([["user-1",30_000]]),
    })).toThrow(/INSUFFICIENT_AFTER_EXTERNAL_CHANGE/);
  });
});
