import type {
  BlackjackBetKind,
  BlackjackHandId,
  BlackjackRoundId,
  BlackjackTransactionId,
  BlackjackUserId,
} from "./domain";
import {
  type BlackjackSettlementTransactionType,
  type BlackjackWalletLedgerState,
  releaseBlackjackReservedFunds,
  reserveBlackjackFunds,
  settleBlackjackReservedFunds,
} from "./walletLedger";

export type BlackjackReservationStatus =
  | "RESERVED"
  | "RELEASED"
  | "SETTLED";

export type BlackjackFundsReservation = Readonly<{
  reservationId: string;
  reserveTransactionId: BlackjackTransactionId;
  userId: BlackjackUserId;
  roundId: BlackjackRoundId;
  handId: BlackjackHandId | null;
  kind: BlackjackBetKind;
  amountCents: number;
  status: BlackjackReservationStatus;
  terminalTransactionId: BlackjackTransactionId | null;
  terminalType: BlackjackSettlementTransactionType | "BET_RELEASE" | null;
  returnCents: number | null;
}>;

export type BlackjackReservationBook = Readonly<{
  userId: BlackjackUserId;
  reservations: readonly BlackjackFundsReservation[];
}>;

function assertNonEmptyId(label: string, value: string): void {
  if (!value.trim()) {
    throw new RangeError(`Blackjack ${label} must be a non-empty string`);
  }
}

function assertPositiveMoneyCents(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      `Blackjack ${label} must be a positive safe integer number of cents`,
    );
  }
}

function assertBookOwner(
  wallet: BlackjackWalletLedgerState,
  book: BlackjackReservationBook,
  userId: string,
): void {
  if (wallet.userId !== userId || book.userId !== userId) {
    throw new Error("Blackjack reservation owner does not match wallet/book");
  }
}

function freezeReservation(
  reservation: BlackjackFundsReservation,
): BlackjackFundsReservation {
  return Object.freeze({ ...reservation });
}

function freezeBook(
  book: BlackjackReservationBook,
  reservations: readonly BlackjackFundsReservation[],
): BlackjackReservationBook {
  return Object.freeze({
    ...book,
    reservations: Object.freeze(
      reservations.map((reservation) => freezeReservation(reservation)),
    ),
  });
}

function reserveTypeForKind(kind: BlackjackBetKind) {
  if (kind === "INITIAL") return "BET_RESERVE" as const;
  if (kind === "DOUBLE") return "DOUBLE_RESERVE" as const;
  return "SPLIT_RESERVE" as const;
}

function sameReservationSemantics(
  reservation: BlackjackFundsReservation,
  input: {
    reservationId: string;
    reserveTransactionId: string;
    userId: string;
    roundId: string;
    handId: string | null;
    kind: BlackjackBetKind;
    amountCents: number;
  },
): boolean {
  return (
    reservation.reservationId === input.reservationId &&
    reservation.reserveTransactionId === input.reserveTransactionId &&
    reservation.userId === input.userId &&
    reservation.roundId === input.roundId &&
    reservation.handId === input.handId &&
    reservation.kind === input.kind &&
    reservation.amountCents === input.amountCents
  );
}

export function createBlackjackReservationBook(
  userId: BlackjackUserId,
): BlackjackReservationBook {
  assertNonEmptyId("userId", userId);
  return Object.freeze({
    userId,
    reservations: Object.freeze([]),
  });
}

export function getBlackjackReservedAmountFromBook(
  book: BlackjackReservationBook,
): number {
  let total = 0;
  for (const reservation of book.reservations) {
    if (reservation.status !== "RESERVED") continue;
    total += reservation.amountCents;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("Blackjack reservation total exceeds safe integer range");
    }
  }
  return total;
}

export function assertBlackjackReservationWalletConsistency(
  wallet: BlackjackWalletLedgerState,
  book: BlackjackReservationBook,
): void {
  if (wallet.userId !== book.userId) {
    throw new Error("Blackjack reservation book belongs to another wallet");
  }

  const expectedReserved = getBlackjackReservedAmountFromBook(book);
  if (wallet.reservedBalanceCents !== expectedReserved) {
    throw new Error(
      `Blackjack reservation mismatch: wallet=${wallet.reservedBalanceCents}, book=${expectedReserved}`,
    );
  }
}

export type BlackjackReservationMutation = Readonly<{
  wallet: BlackjackWalletLedgerState;
  book: BlackjackReservationBook;
  reservation: BlackjackFundsReservation;
}>;

export function reserveBlackjackWager(
  wallet: BlackjackWalletLedgerState,
  book: BlackjackReservationBook,
  input: {
    reservationId: string;
    reserveTransactionId: BlackjackTransactionId;
    userId: BlackjackUserId;
    roundId: BlackjackRoundId;
    handId: BlackjackHandId | null;
    kind: BlackjackBetKind;
    amountCents: number;
    createdAtMs: number;
  },
): BlackjackReservationMutation {
  assertNonEmptyId("reservationId", input.reservationId);
  assertNonEmptyId("reserveTransactionId", input.reserveTransactionId);
  assertNonEmptyId("roundId", input.roundId);
  if (input.handId !== null) assertNonEmptyId("handId", input.handId);
  assertPositiveMoneyCents("reservation amountCents", input.amountCents);
  assertBookOwner(wallet, book, input.userId);

  if (input.kind !== "INITIAL" && input.handId === null) {
    throw new Error("Blackjack DOUBLE/SPLIT reservations require a handId");
  }

  const existingById = book.reservations.find(
    (reservation) => reservation.reservationId === input.reservationId,
  );
  if (existingById) {
    if (!sameReservationSemantics(existingById, input)) {
      throw new Error(
        `Blackjack reservationId conflict: ${input.reservationId}`,
      );
    }

    const replayWallet = reserveBlackjackFunds(wallet, {
      transactionId: input.reserveTransactionId,
      userId: input.userId,
      roundId: input.roundId,
      handId: input.handId,
      type: reserveTypeForKind(input.kind),
      amountCents: input.amountCents,
      createdAtMs: input.createdAtMs,
    });
    assertBlackjackReservationWalletConsistency(replayWallet, book);
    return Object.freeze({
      wallet: replayWallet,
      book,
      reservation: existingById,
    });
  }

  const reusedTransaction = book.reservations.find(
    (reservation) =>
      reservation.reserveTransactionId === input.reserveTransactionId,
  );
  if (reusedTransaction) {
    throw new Error(
      `Blackjack reserveTransactionId already belongs to reservation ${reusedTransaction.reservationId}`,
    );
  }

  const nextWallet = reserveBlackjackFunds(wallet, {
    transactionId: input.reserveTransactionId,
    userId: input.userId,
    roundId: input.roundId,
    handId: input.handId,
    type: reserveTypeForKind(input.kind),
    amountCents: input.amountCents,
    createdAtMs: input.createdAtMs,
  });

  const reservation = freezeReservation({
    reservationId: input.reservationId,
    reserveTransactionId: input.reserveTransactionId,
    userId: input.userId,
    roundId: input.roundId,
    handId: input.handId,
    kind: input.kind,
    amountCents: input.amountCents,
    status: "RESERVED",
    terminalTransactionId: null,
    terminalType: null,
    returnCents: null,
  });
  const nextBook = freezeBook(book, [...book.reservations, reservation]);

  assertBlackjackReservationWalletConsistency(nextWallet, nextBook);
  return Object.freeze({
    wallet: nextWallet,
    book: nextBook,
    reservation,
  });
}

export function bindBlackjackReservationToHand(
  book: BlackjackReservationBook,
  input: {
    reservationId: string;
    handId: BlackjackHandId;
  },
): BlackjackReservationBook {
  assertNonEmptyId("reservationId", input.reservationId);
  assertNonEmptyId("handId", input.handId);

  const reservation = book.reservations.find(
    (candidate) => candidate.reservationId === input.reservationId,
  );
  if (!reservation) {
    throw new Error("Blackjack reservation does not exist");
  }
  if (reservation.status !== "RESERVED") {
    throw new Error("Blackjack terminal reservation cannot be rebound");
  }
  if (reservation.handId === input.handId) return book;
  if (reservation.handId !== null) {
    throw new Error("Blackjack reservation is already bound to another hand");
  }

  return freezeBook(
    book,
    book.reservations.map((candidate) =>
      candidate.reservationId === input.reservationId
        ? { ...candidate, handId: input.handId }
        : candidate,
    ),
  );
}

function terminalReplayMatches(
  reservation: BlackjackFundsReservation,
  transactionId: string,
  terminalType: BlackjackSettlementTransactionType | "BET_RELEASE",
  returnCents: number,
): boolean {
  return (
    reservation.terminalTransactionId === transactionId &&
    reservation.terminalType === terminalType &&
    reservation.returnCents === returnCents
  );
}

export function releaseBlackjackWagerReservation(
  wallet: BlackjackWalletLedgerState,
  book: BlackjackReservationBook,
  input: {
    reservationId: string;
    transactionId: BlackjackTransactionId;
    createdAtMs: number;
  },
): BlackjackReservationMutation {
  assertNonEmptyId("reservationId", input.reservationId);
  assertNonEmptyId("transactionId", input.transactionId);
  assertBookOwner(wallet, book, book.userId);

  const reservation = book.reservations.find(
    (candidate) => candidate.reservationId === input.reservationId,
  );
  if (!reservation) throw new Error("Blackjack reservation does not exist");

  if (reservation.status !== "RESERVED") {
    if (
      reservation.status === "RELEASED" &&
      terminalReplayMatches(
        reservation,
        input.transactionId,
        "BET_RELEASE",
        reservation.amountCents,
      )
    ) {
      return Object.freeze({ wallet, book, reservation });
    }
    throw new Error("Blackjack reservation is already terminal");
  }

  const nextWallet = releaseBlackjackReservedFunds(wallet, {
    transactionId: input.transactionId,
    userId: reservation.userId,
    roundId: reservation.roundId,
    handId: reservation.handId,
    amountCents: reservation.amountCents,
    createdAtMs: input.createdAtMs,
  });

  const terminalReservation = freezeReservation({
    ...reservation,
    status: "RELEASED",
    terminalTransactionId: input.transactionId,
    terminalType: "BET_RELEASE",
    returnCents: reservation.amountCents,
  });
  const nextBook = freezeBook(
    book,
    book.reservations.map((candidate) =>
      candidate.reservationId === reservation.reservationId
        ? terminalReservation
        : candidate,
    ),
  );

  assertBlackjackReservationWalletConsistency(nextWallet, nextBook);
  return Object.freeze({
    wallet: nextWallet,
    book: nextBook,
    reservation: terminalReservation,
  });
}

export function settleBlackjackWagerReservation(
  wallet: BlackjackWalletLedgerState,
  book: BlackjackReservationBook,
  input: {
    reservationId: string;
    transactionId: BlackjackTransactionId;
    type: BlackjackSettlementTransactionType;
    returnCents: number;
    createdAtMs: number;
  },
): BlackjackReservationMutation {
  assertNonEmptyId("reservationId", input.reservationId);
  assertNonEmptyId("transactionId", input.transactionId);
  assertBookOwner(wallet, book, book.userId);

  const reservation = book.reservations.find(
    (candidate) => candidate.reservationId === input.reservationId,
  );
  if (!reservation) throw new Error("Blackjack reservation does not exist");
  if (reservation.handId === null) {
    throw new Error("Blackjack reservation must be bound to a hand before settlement");
  }

  if (reservation.status !== "RESERVED") {
    if (
      reservation.status === "SETTLED" &&
      terminalReplayMatches(
        reservation,
        input.transactionId,
        input.type,
        input.returnCents,
      )
    ) {
      return Object.freeze({ wallet, book, reservation });
    }
    throw new Error("Blackjack reservation is already terminal");
  }

  const nextWallet = settleBlackjackReservedFunds(wallet, {
    transactionId: input.transactionId,
    userId: reservation.userId,
    roundId: reservation.roundId,
    handId: reservation.handId,
    type: input.type,
    reservedStakeCents: reservation.amountCents,
    returnCents: input.returnCents,
    createdAtMs: input.createdAtMs,
  });

  const terminalReservation = freezeReservation({
    ...reservation,
    status: "SETTLED",
    terminalTransactionId: input.transactionId,
    terminalType: input.type,
    returnCents: input.returnCents,
  });
  const nextBook = freezeBook(
    book,
    book.reservations.map((candidate) =>
      candidate.reservationId === reservation.reservationId
        ? terminalReservation
        : candidate,
    ),
  );

  assertBlackjackReservationWalletConsistency(nextWallet, nextBook);
  return Object.freeze({
    wallet: nextWallet,
    book: nextBook,
    reservation: terminalReservation,
  });
}
