import { describe, expect, it } from "vitest";
import { createBlackjackWalletLedgerState } from "./walletLedger";
import {
  assertBlackjackReservationWalletConsistency,
  bindBlackjackReservationToHand,
  createBlackjackReservationBook,
  getBlackjackReservedAmountFromBook,
  releaseBlackjackWagerReservation,
  reserveBlackjackWager,
  settleBlackjackWagerReservation,
} from "./reservations";

function setup(balanceCents = 20_000) {
  return {
    wallet: createBlackjackWalletLedgerState({
      userId: "user-1",
      totalBalanceCents: balanceCents,
    }),
    book: createBlackjackReservationBook("user-1"),
  };
}

describe("blackjack exact wager reservations", () => {
  it("binds an INITIAL reserve to its exact round and later hand", () => {
    const initial = setup();
    const reserved = reserveBlackjackWager(initial.wallet, initial.book, {
      reservationId: "bet-1",
      reserveTransactionId: "tx-bet-1",
      userId: "user-1",
      roundId: "round-1",
      handId: null,
      kind: "INITIAL",
      amountCents: 4_000,
      createdAtMs: 1,
    });

    expect(reserved.reservation).toMatchObject({
      reservationId: "bet-1",
      roundId: "round-1",
      handId: null,
      kind: "INITIAL",
      amountCents: 4_000,
      status: "RESERVED",
    });
    expect(reserved.wallet.availableBalanceCents).toBe(16_000);
    expect(reserved.wallet.reservedBalanceCents).toBe(4_000);
    expect(getBlackjackReservedAmountFromBook(reserved.book)).toBe(4_000);

    const boundBook = bindBlackjackReservationToHand(reserved.book, {
      reservationId: "bet-1",
      handId: "hand-1",
    });
    expect(boundBook.reservations[0].handId).toBe("hand-1");
  });

  it("rejects reservationId or reserveTransactionId reuse for another wager", () => {
    const initial = setup();
    const first = reserveBlackjackWager(initial.wallet, initial.book, {
      reservationId: "bet-1",
      reserveTransactionId: "tx-reserve-1",
      userId: "user-1",
      roundId: "round-1",
      handId: null,
      kind: "INITIAL",
      amountCents: 4_000,
      createdAtMs: 2,
    });

    expect(() =>
      reserveBlackjackWager(first.wallet, first.book, {
        reservationId: "bet-1",
        reserveTransactionId: "tx-reserve-2",
        userId: "user-1",
        roundId: "round-2",
        handId: null,
        kind: "INITIAL",
        amountCents: 4_000,
        createdAtMs: 3,
      }),
    ).toThrow(/reservationId conflict/);

    expect(() =>
      reserveBlackjackWager(first.wallet, first.book, {
        reservationId: "bet-2",
        reserveTransactionId: "tx-reserve-1",
        userId: "user-1",
        roundId: "round-1",
        handId: null,
        kind: "INITIAL",
        amountCents: 4_000,
        createdAtMs: 3,
      }),
    ).toThrow(/already belongs/);
  });

  it("requires DOUBLE and SPLIT reservations to be hand-bound at creation", () => {
    const initial = setup();

    expect(() =>
      reserveBlackjackWager(initial.wallet, initial.book, {
        reservationId: "double-1",
        reserveTransactionId: "tx-double-1",
        userId: "user-1",
        roundId: "round-1",
        handId: null,
        kind: "DOUBLE",
        amountCents: 4_000,
        createdAtMs: 4,
      }),
    ).toThrow(/require a handId/);
  });

  it("supports multiple exact reserves for one hand without losing accounting", () => {
    const initial = setup();

    const base = reserveBlackjackWager(initial.wallet, initial.book, {
      reservationId: "bet-base",
      reserveTransactionId: "tx-base",
      userId: "user-1",
      roundId: "round-1",
      handId: "hand-1",
      kind: "INITIAL",
      amountCents: 4_000,
      createdAtMs: 5,
    });
    const doubled = reserveBlackjackWager(base.wallet, base.book, {
      reservationId: "bet-double",
      reserveTransactionId: "tx-double",
      userId: "user-1",
      roundId: "round-1",
      handId: "hand-1",
      kind: "DOUBLE",
      amountCents: 4_000,
      createdAtMs: 6,
    });

    expect(doubled.wallet.availableBalanceCents).toBe(12_000);
    expect(doubled.wallet.reservedBalanceCents).toBe(8_000);
    expect(getBlackjackReservedAmountFromBook(doubled.book)).toBe(8_000);
    expect(doubled.book.reservations).toHaveLength(2);
    expect(() =>
      assertBlackjackReservationWalletConsistency(doubled.wallet, doubled.book),
    ).not.toThrow();
  });

  it("settles only the selected reservation and preserves other reserved money", () => {
    const initial = setup();
    const first = reserveBlackjackWager(initial.wallet, initial.book, {
      reservationId: "bet-round-1",
      reserveTransactionId: "tx-round-1",
      userId: "user-1",
      roundId: "round-1",
      handId: "hand-1",
      kind: "INITIAL",
      amountCents: 4_000,
      createdAtMs: 7,
    });
    const second = reserveBlackjackWager(first.wallet, first.book, {
      reservationId: "bet-round-2",
      reserveTransactionId: "tx-round-2",
      userId: "user-1",
      roundId: "round-2",
      handId: "hand-2",
      kind: "INITIAL",
      amountCents: 3_000,
      createdAtMs: 8,
    });

    const settled = settleBlackjackWagerReservation(second.wallet, second.book, {
      reservationId: "bet-round-1",
      transactionId: "tx-settle-round-1",
      type: "LOSS_SETTLE",
      returnCents: 0,
      createdAtMs: 9,
    });

    expect(settled.wallet.availableBalanceCents).toBe(13_000);
    expect(settled.wallet.reservedBalanceCents).toBe(3_000);
    expect(getBlackjackReservedAmountFromBook(settled.book)).toBe(3_000);
    expect(
      settled.book.reservations.find((r) => r.reservationId === "bet-round-1")
        ?.status,
    ).toBe("SETTLED");
    expect(
      settled.book.reservations.find((r) => r.reservationId === "bet-round-2")
        ?.status,
    ).toBe("RESERVED");
  });

  it("releases only the selected reservation", () => {
    const initial = setup();
    const first = reserveBlackjackWager(initial.wallet, initial.book, {
      reservationId: "bet-a",
      reserveTransactionId: "tx-a",
      userId: "user-1",
      roundId: "round-a",
      handId: null,
      kind: "INITIAL",
      amountCents: 4_000,
      createdAtMs: 10,
    });
    const second = reserveBlackjackWager(first.wallet, first.book, {
      reservationId: "bet-b",
      reserveTransactionId: "tx-b",
      userId: "user-1",
      roundId: "round-b",
      handId: null,
      kind: "INITIAL",
      amountCents: 3_000,
      createdAtMs: 11,
    });

    const released = releaseBlackjackWagerReservation(second.wallet, second.book, {
      reservationId: "bet-a",
      transactionId: "tx-release-a",
      createdAtMs: 12,
    });

    expect(released.wallet.availableBalanceCents).toBe(17_000);
    expect(released.wallet.reservedBalanceCents).toBe(3_000);
    expect(getBlackjackReservedAmountFromBook(released.book)).toBe(3_000);
  });

  it("makes reserve, release and settlement retries idempotent", () => {
    const initial = setup(5_000);
    const reserveInput = {
      reservationId: "bet-retry",
      reserveTransactionId: "tx-retry-reserve",
      userId: "user-1",
      roundId: "round-1",
      handId: "hand-1",
      kind: "INITIAL" as const,
      amountCents: 5_000,
      createdAtMs: 13,
    };
    const first = reserveBlackjackWager(initial.wallet, initial.book, reserveInput);
    const reserveReplay = reserveBlackjackWager(first.wallet, first.book, {
      ...reserveInput,
      createdAtMs: 999,
    });
    expect(reserveReplay.wallet).toBe(first.wallet);
    expect(reserveReplay.book).toBe(first.book);

    const settled = settleBlackjackWagerReservation(
      reserveReplay.wallet,
      reserveReplay.book,
      {
        reservationId: "bet-retry",
        transactionId: "tx-retry-settle",
        type: "PUSH_RETURN",
        returnCents: 5_000,
        createdAtMs: 14,
      },
    );
    const settleReplay = settleBlackjackWagerReservation(
      settled.wallet,
      settled.book,
      {
        reservationId: "bet-retry",
        transactionId: "tx-retry-settle",
        type: "PUSH_RETURN",
        returnCents: 5_000,
        createdAtMs: 1_000,
      },
    );

    expect(settleReplay.wallet).toBe(settled.wallet);
    expect(settleReplay.book).toBe(settled.book);
    expect(settleReplay.wallet.availableBalanceCents).toBe(5_000);
    expect(settleReplay.wallet.reservedBalanceCents).toBe(0);
  });

  it("detects wallet/book divergence instead of silently settling wrong funds", () => {
    const initial = setup();
    const reserved = reserveBlackjackWager(initial.wallet, initial.book, {
      reservationId: "bet-consistency",
      reserveTransactionId: "tx-consistency",
      userId: "user-1",
      roundId: "round-1",
      handId: null,
      kind: "INITIAL",
      amountCents: 4_000,
      createdAtMs: 15,
    });

    const corruptWallet = {
      ...reserved.wallet,
      reservedBalanceCents: 3_999,
    };

    expect(() =>
      assertBlackjackReservationWalletConsistency(
        corruptWallet,
        reserved.book,
      ),
    ).toThrow(/reservation mismatch/);
  });
});
