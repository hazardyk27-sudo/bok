import { describe, expect, it } from "vitest";
import { createBlackjackReservationBook } from "./reservations";
import {
  bindBlackjackBetPositionToHand,
  clearBlackjackBet,
  createBlackjackBettingPosition,
  getBlackjackBetTotalCents,
  getInitialDealParticipantFromBet,
  lockBlackjackReadyBet,
  markBlackjackBetReady,
  placeBlackjackBetChip,
  undoLastBlackjackBetChip,
} from "./betting";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function setup(input: {
  balanceCents?: number;
  minBetCents?: number;
  maxBetCents?: number | null;
} = {}) {
  return {
    wallet: createBlackjackWalletLedgerState({
      userId: "user-1",
      totalBalanceCents: input.balanceCents ?? 2_000_000,
    }),
    book: createBlackjackReservationBook("user-1"),
    position: createBlackjackBettingPosition({
      roundId: "round-1",
      playerId: "player-1",
      userId: "user-1",
      seatNumber: 3,
      bettingClosesAtMs: 10_000,
      minBetCents: input.minBetCents ?? 1_000,
      maxBetCents: input.maxBetCents ?? null,
    }),
  };
}

describe("blackjack betting engine", () => {
  it("places canonical chips as exact wallet reservations", () => {
    const initial = setup();
    const oneK = placeBlackjackBetChip(
      initial.wallet,
      initial.book,
      initial.position,
      {
        reservationId: "chip-1k",
        reserveTransactionId: "tx-chip-1k",
        chipValueCents: 100_000,
        nowMs: 100,
      },
    );
    const twoK = placeBlackjackBetChip(
      oneK.wallet,
      oneK.book,
      oneK.position,
      {
        reservationId: "chip-2k",
        reserveTransactionId: "tx-chip-2k",
        chipValueCents: 200_000,
        nowMs: 101,
      },
    );

    expect(getBlackjackBetTotalCents(twoK.position)).toBe(300_000);
    expect(twoK.wallet.availableBalanceCents).toBe(1_700_000);
    expect(twoK.wallet.reservedBalanceCents).toBe(300_000);
    expect(twoK.book.reservations).toHaveLength(2);
  });

  it("makes duplicate chip placement an idempotent replay", () => {
    const initial = setup();
    const input = {
      reservationId: "chip-replay",
      reserveTransactionId: "tx-chip-replay",
      chipValueCents: 100_000,
      nowMs: 100,
    };
    const first = placeBlackjackBetChip(
      initial.wallet,
      initial.book,
      initial.position,
      input,
    );
    const replay = placeBlackjackBetChip(
      first.wallet,
      first.book,
      first.position,
      { ...input, nowMs: 999 },
    );

    expect(replay.position).toBe(first.position);
    expect(replay.wallet).toBe(first.wallet);
    expect(replay.book).toBe(first.book);
    expect(getBlackjackBetTotalCents(replay.position)).toBe(100_000);
  });

  it("rejects invalid chip denominations and optional table max overflow", () => {
    const initial = setup({ maxBetCents: 150_000 });

    expect(() =>
      placeBlackjackBetChip(
        initial.wallet,
        initial.book,
        initial.position,
        {
          reservationId: "bad-chip",
          reserveTransactionId: "tx-bad-chip",
          chipValueCents: 20_000,
          nowMs: 100,
        },
      ),
    ).toThrow(/valid denomination/);

    const first = placeBlackjackBetChip(
      initial.wallet,
      initial.book,
      initial.position,
      {
        reservationId: "chip-100",
        reserveTransactionId: "tx-chip-100",
        chipValueCents: 10_000,
        nowMs: 100,
      },
    );

    expect(() =>
      placeBlackjackBetChip(first.wallet, first.book, first.position, {
        reservationId: "chip-over-max",
        reserveTransactionId: "tx-over-max",
        chipValueCents: 200_000,
        nowMs: 101,
      }),
    ).toThrow(/table maximum/);
  });

  it("has no table maximum when maxBetCents is null; wallet availability is the limit", () => {
    const initial = setup({ balanceCents: 3_200_000, maxBetCents: null });

    const placed = placeBlackjackBetChip(
      initial.wallet,
      initial.book,
      initial.position,
      {
        reservationId: "chip-32k",
        reserveTransactionId: "tx-chip-32k",
        chipValueCents: 3_200_000,
        nowMs: 100,
      },
    );

    expect(getBlackjackBetTotalCents(placed.position)).toBe(3_200_000);
    expect(placed.wallet.availableBalanceCents).toBe(0);

    expect(() =>
      placeBlackjackBetChip(placed.wallet, placed.book, placed.position, {
        reservationId: "chip-extra",
        reserveTransactionId: "tx-chip-extra",
        chipValueCents: 1_000,
        nowMs: 101,
      }),
    ).toThrow(/insufficient available balance/);
  });

  it("UNDO releases only the last active chip and rejects stale undo targets", () => {
    const initial = setup();
    const first = placeBlackjackBetChip(
      initial.wallet,
      initial.book,
      initial.position,
      {
        reservationId: "chip-a",
        reserveTransactionId: "tx-a",
        chipValueCents: 100_000,
        nowMs: 100,
      },
    );
    const second = placeBlackjackBetChip(
      first.wallet,
      first.book,
      first.position,
      {
        reservationId: "chip-b",
        reserveTransactionId: "tx-b",
        chipValueCents: 200_000,
        nowMs: 101,
      },
    );

    expect(() =>
      undoLastBlackjackBetChip(second.wallet, second.book, second.position, {
        expectedReservationId: "chip-a",
        releaseTransactionId: "tx-undo-stale",
        nowMs: 102,
      }),
    ).toThrow(/stale chip/);

    const undone = undoLastBlackjackBetChip(
      second.wallet,
      second.book,
      second.position,
      {
        expectedReservationId: "chip-b",
        releaseTransactionId: "tx-undo-b",
        nowMs: 103,
      },
    );

    expect(getBlackjackBetTotalCents(undone.position)).toBe(100_000);
    expect(undone.wallet.reservedBalanceCents).toBe(100_000);
    expect(
      undone.position.chips.find((chip) => chip.reservationId === "chip-b")
        ?.status,
    ).toBe("RELEASED");
  });

  it("makes UNDO retry idempotent even when an earlier chip is still active", () => {
    const initial = setup();
    const first = placeBlackjackBetChip(
      initial.wallet,
      initial.book,
      initial.position,
      {
        reservationId: "chip-a",
        reserveTransactionId: "tx-a",
        chipValueCents: 100_000,
        nowMs: 100,
      },
    );
    const second = placeBlackjackBetChip(
      first.wallet,
      first.book,
      first.position,
      {
        reservationId: "chip-b",
        reserveTransactionId: "tx-b",
        chipValueCents: 200_000,
        nowMs: 101,
      },
    );
    const undone = undoLastBlackjackBetChip(
      second.wallet,
      second.book,
      second.position,
      {
        expectedReservationId: "chip-b",
        releaseTransactionId: "tx-undo-b",
        nowMs: 102,
      },
    );
    const replay = undoLastBlackjackBetChip(
      undone.wallet,
      undone.book,
      undone.position,
      {
        expectedReservationId: "chip-b",
        releaseTransactionId: "tx-undo-b",
        nowMs: 999,
      },
    );

    expect(replay.wallet).toBe(undone.wallet);
    expect(replay.book).toBe(undone.book);
    expect(replay.position).toBe(undone.position);
    expect(getBlackjackBetTotalCents(replay.position)).toBe(100_000);
  });

  it("CLEAR releases every active chip while keeping immutable history", () => {
    const initial = setup();
    const first = placeBlackjackBetChip(
      initial.wallet,
      initial.book,
      initial.position,
      {
        reservationId: "chip-a",
        reserveTransactionId: "tx-a",
        chipValueCents: 100_000,
        nowMs: 100,
      },
    );
    const second = placeBlackjackBetChip(
      first.wallet,
      first.book,
      first.position,
      {
        reservationId: "chip-b",
        reserveTransactionId: "tx-b",
        chipValueCents: 200_000,
        nowMs: 101,
      },
    );

    const cleared = clearBlackjackBet(
      second.wallet,
      second.book,
      second.position,
      {
        clearTransactionId: "tx-clear",
        nowMs: 102,
      },
    );

    expect(getBlackjackBetTotalCents(cleared.position)).toBe(0);
    expect(cleared.wallet.reservedBalanceCents).toBe(0);
    expect(cleared.position.chips).toHaveLength(2);
    expect(cleared.position.chips.every((chip) => chip.status === "RELEASED")).toBe(true);
  });

  it("READY enforces minimum bet and then locks all bet mutations", () => {
    const initial = setup({ minBetCents: 100_000 });

    expect(() => markBlackjackBetReady(initial.position, 100)).toThrow(
      /below table minimum/,
    );

    const placed = placeBlackjackBetChip(
      initial.wallet,
      initial.book,
      initial.position,
      {
        reservationId: "chip-ready",
        reserveTransactionId: "tx-ready",
        chipValueCents: 100_000,
        nowMs: 101,
      },
    );
    const ready = markBlackjackBetReady(placed.position, 102);

    expect(ready.status).toBe("READY");
    expect(() =>
      placeBlackjackBetChip(placed.wallet, placed.book, ready, {
        reservationId: "chip-after-ready",
        reserveTransactionId: "tx-after-ready",
        chipValueCents: 1_000,
        nowMs: 103,
      }),
    ).toThrow(/already locked/);

    const locked = lockBlackjackReadyBet(ready);
    expect(locked.status).toBe("LOCKED");
  });

  it("uses server time and rejects mutations at or after bettingClosesAtMs", () => {
    const initial = setup();

    expect(() =>
      placeBlackjackBetChip(
        initial.wallet,
        initial.book,
        initial.position,
        {
          reservationId: "late-chip",
          reserveTransactionId: "tx-late",
          chipValueCents: 1_000,
          nowMs: 10_000,
        },
      ),
    ).toThrow(/window is closed/);

    expect(() => markBlackjackBetReady(initial.position, 10_000)).toThrow(
      /window is closed/,
    );
  });

  it("rejects hand binding through another user's reservation book", () => {
    const initial = setup();
    const placed = placeBlackjackBetChip(
      initial.wallet,
      initial.book,
      initial.position,
      {
        reservationId: "chip-owner",
        reserveTransactionId: "tx-owner",
        chipValueCents: 100_000,
        nowMs: 100,
      },
    );
    const ready = markBlackjackBetReady(placed.position, 101);
    const foreignBook = createBlackjackReservationBook("user-2");

    expect(() =>
      bindBlackjackBetPositionToHand(foreignBook, ready, "hand-1"),
    ).toThrow(/owner mismatch/);
  });

  it("converts only READY/LOCKED positions into initial-deal participants", () => {
    const initial = setup();
    const placed = placeBlackjackBetChip(
      initial.wallet,
      initial.book,
      initial.position,
      {
        reservationId: "chip-deal",
        reserveTransactionId: "tx-deal",
        chipValueCents: 100_000,
        nowMs: 100,
      },
    );

    expect(() => getInitialDealParticipantFromBet(placed.position)).toThrow(
      /READY/,
    );

    const ready = markBlackjackBetReady(placed.position, 101);
    expect(getInitialDealParticipantFromBet(ready)).toEqual({
      playerId: "player-1",
      seatNumber: 3,
      betCents: 100_000,
    });

    const boundBook = bindBlackjackBetPositionToHand(
      placed.book,
      ready,
      "hand-1",
    );
    expect(boundBook.reservations[0].handId).toBe("hand-1");
  });
});
