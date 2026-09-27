import { describe, expect, it } from "vitest";
import {
  createBlackjackWalletLedgerState,
  getBlackjackWalletTotalBalanceCents,
  releaseBlackjackReservedFunds,
  reserveBlackjackFunds,
  settleBlackjackReservedFunds,
} from "./walletLedger";

function wallet() {
  return createBlackjackWalletLedgerState({
    userId: "user-1",
    totalBalanceCents: 20_000,
  });
}

describe("blackjack wallet ledger foundation", () => {
  it("separates available and reserved funds without changing total balance", () => {
    const initial = wallet();
    const reserved = reserveBlackjackFunds(initial, {
      transactionId: "tx-reserve-1",
      userId: "user-1",
      roundId: "round-1",
      handId: null,
      type: "BET_RESERVE",
      amountCents: 4_000,
      createdAtMs: 10,
    });

    expect(initial).toMatchObject({
      availableBalanceCents: 20_000,
      reservedBalanceCents: 0,
    });
    expect(reserved).toMatchObject({
      availableBalanceCents: 16_000,
      reservedBalanceCents: 4_000,
    });
    expect(getBlackjackWalletTotalBalanceCents(reserved)).toBe(20_000);
  });

  it("treats an identical repeated transactionId as an idempotent replay", () => {
    const input = {
      transactionId: "tx-idempotent",
      userId: "user-1",
      roundId: "round-1",
      handId: null,
      type: "BET_RESERVE" as const,
      amountCents: 5_000,
      createdAtMs: 20,
    };

    const once = reserveBlackjackFunds(wallet(), input);
    const twice = reserveBlackjackFunds(once, input);

    expect(twice).toBe(once);
    expect(twice.entries).toHaveLength(1);
    expect(twice.availableBalanceCents).toBe(15_000);
    expect(twice.reservedBalanceCents).toBe(5_000);
  });

  it("rejects transactionId reuse with a different payload", () => {
    const first = reserveBlackjackFunds(wallet(), {
      transactionId: "tx-conflict",
      userId: "user-1",
      roundId: "round-1",
      handId: null,
      type: "BET_RESERVE",
      amountCents: 4_000,
      createdAtMs: 30,
    });

    expect(() =>
      reserveBlackjackFunds(first, {
        transactionId: "tx-conflict",
        userId: "user-1",
        roundId: "round-1",
        handId: null,
        type: "BET_RESERVE",
        amountCents: 8_000,
        createdAtMs: 30,
      }),
    ).toThrow(/transactionId conflict/);
  });

  it("rejects over-reservation before changing wallet state", () => {
    const initial = wallet();

    expect(() =>
      reserveBlackjackFunds(initial, {
        transactionId: "tx-too-large",
        userId: "user-1",
        roundId: "round-1",
        handId: null,
        type: "BET_RESERVE",
        amountCents: 20_001,
        createdAtMs: 40,
      }),
    ).toThrow(/insufficient available balance/);

    expect(initial.availableBalanceCents).toBe(20_000);
    expect(initial.reservedBalanceCents).toBe(0);
  });

  it("releases a cancelled reservation back to available balance", () => {
    const reserved = reserveBlackjackFunds(wallet(), {
      transactionId: "tx-reserve-release",
      userId: "user-1",
      roundId: "round-1",
      handId: null,
      type: "BET_RESERVE",
      amountCents: 4_000,
      createdAtMs: 50,
    });

    const released = releaseBlackjackReservedFunds(reserved, {
      transactionId: "tx-release",
      userId: "user-1",
      roundId: "round-1",
      handId: null,
      amountCents: 4_000,
      createdAtMs: 51,
    });

    expect(released.availableBalanceCents).toBe(20_000);
    expect(released.reservedBalanceCents).toBe(0);
    expect(getBlackjackWalletTotalBalanceCents(released)).toBe(20_000);
  });

  it("consumes reserved stake on a loss", () => {
    const reserved = reserveBlackjackFunds(wallet(), {
      transactionId: "tx-loss-reserve",
      userId: "user-1",
      roundId: "round-1",
      handId: "hand-1",
      type: "BET_RESERVE",
      amountCents: 4_000,
      createdAtMs: 60,
    });

    const settled = settleBlackjackReservedFunds(reserved, {
      transactionId: "tx-loss-settle",
      userId: "user-1",
      roundId: "round-1",
      handId: "hand-1",
      type: "LOSS_SETTLE",
      reservedStakeCents: 4_000,
      returnCents: 0,
      createdAtMs: 61,
    });

    expect(settled.availableBalanceCents).toBe(16_000);
    expect(settled.reservedBalanceCents).toBe(0);
    expect(getBlackjackWalletTotalBalanceCents(settled)).toBe(16_000);
  });

  it("returns stake plus profit on a normal win", () => {
    const reserved = reserveBlackjackFunds(wallet(), {
      transactionId: "tx-win-reserve",
      userId: "user-1",
      roundId: "round-1",
      handId: "hand-1",
      type: "BET_RESERVE",
      amountCents: 4_000,
      createdAtMs: 70,
    });

    const settled = settleBlackjackReservedFunds(reserved, {
      transactionId: "tx-win-settle",
      userId: "user-1",
      roundId: "round-1",
      handId: "hand-1",
      type: "WIN_PAYOUT",
      reservedStakeCents: 4_000,
      returnCents: 8_000,
      createdAtMs: 71,
    });

    expect(settled.availableBalanceCents).toBe(24_000);
    expect(settled.reservedBalanceCents).toBe(0);
    expect(getBlackjackWalletTotalBalanceCents(settled)).toBe(24_000);
  });

  it("returns exactly the stake on a push", () => {
    const reserved = reserveBlackjackFunds(wallet(), {
      transactionId: "tx-push-reserve",
      userId: "user-1",
      roundId: "round-1",
      handId: "hand-1",
      type: "BET_RESERVE",
      amountCents: 4_000,
      createdAtMs: 80,
    });

    const settled = settleBlackjackReservedFunds(reserved, {
      transactionId: "tx-push-settle",
      userId: "user-1",
      roundId: "round-1",
      handId: "hand-1",
      type: "PUSH_RETURN",
      reservedStakeCents: 4_000,
      returnCents: 4_000,
      createdAtMs: 81,
    });

    expect(settled.availableBalanceCents).toBe(20_000);
    expect(settled.reservedBalanceCents).toBe(0);
    expect(getBlackjackWalletTotalBalanceCents(settled)).toBe(20_000);
  });

  it("rejects impossible settlement semantics and reserve underflow", () => {
    const reserved = reserveBlackjackFunds(wallet(), {
      transactionId: "tx-invalid-reserve",
      userId: "user-1",
      roundId: "round-1",
      handId: "hand-1",
      type: "BET_RESERVE",
      amountCents: 4_000,
      createdAtMs: 90,
    });

    expect(() =>
      settleBlackjackReservedFunds(reserved, {
        transactionId: "tx-bad-loss",
        userId: "user-1",
        roundId: "round-1",
        handId: "hand-1",
        type: "LOSS_SETTLE",
        reservedStakeCents: 4_000,
        returnCents: 1,
        createdAtMs: 91,
      }),
    ).toThrow(/LOSS_SETTLE/);

    expect(() =>
      releaseBlackjackReservedFunds(reserved, {
        transactionId: "tx-over-release",
        userId: "user-1",
        roundId: "round-1",
        handId: "hand-1",
        amountCents: 4_001,
        createdAtMs: 92,
      }),
    ).toThrow(/more than reserved/);
  });
});
