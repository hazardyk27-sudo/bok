import type {
  BlackjackPlayerId,
  BlackjackRoundId,
  BlackjackSeatNumber,
  BlackjackUserId,
} from "./domain";
import { isBlackjackChipDenominationCents } from "./chips";
import {
  type BlackjackReservationBook,
  bindBlackjackReservationToHand,
  releaseBlackjackWagerReservation,
  reserveBlackjackWager,
} from "./reservations";
import type { BlackjackWalletLedgerState } from "./walletLedger";

export type BlackjackBettingPositionStatus = "OPEN" | "READY" | "LOCKED";

export type BlackjackBetChipPlacement = Readonly<{
  reservationId: string;
  reserveTransactionId: string;
  chipValueCents: number;
  status: "ACTIVE" | "RELEASED";
}>;

export type BlackjackBettingPosition = Readonly<{
  roundId: BlackjackRoundId;
  playerId: BlackjackPlayerId;
  userId: BlackjackUserId;
  seatNumber: BlackjackSeatNumber;
  bettingClosesAtMs: number;
  minBetCents: number;
  maxBetCents: number | null;
  status: BlackjackBettingPositionStatus;
  chips: readonly BlackjackBetChipPlacement[];
}>;

export type BlackjackBettingMutation = Readonly<{
  wallet: BlackjackWalletLedgerState;
  book: BlackjackReservationBook;
  position: BlackjackBettingPosition;
}>;

function assertNonEmptyId(label: string, value: string): void {
  if (!value.trim()) {
    throw new RangeError(`Blackjack ${label} must be a non-empty string`);
  }
}

function assertSafeNonNegativeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `Blackjack ${label} must be a non-negative safe integer`,
    );
  }
}

function assertPositiveMoney(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      `Blackjack ${label} must be a positive safe integer number of cents`,
    );
  }
}

function assertBettingOpen(
  position: BlackjackBettingPosition,
  nowMs: number,
): void {
  assertSafeNonNegativeInteger("nowMs", nowMs);
  if (position.status !== "OPEN") {
    throw new Error("Blackjack bet is already locked for mutation");
  }
  if (nowMs >= position.bettingClosesAtMs) {
    throw new Error("Blackjack betting window is closed");
  }
}

function assertOwners(
  wallet: BlackjackWalletLedgerState,
  book: BlackjackReservationBook,
  position: BlackjackBettingPosition,
): void {
  if (
    wallet.userId !== position.userId ||
    book.userId !== position.userId
  ) {
    throw new Error("Blackjack betting position owner mismatch");
  }
}

function freezePosition(
  position: BlackjackBettingPosition,
  chips: readonly BlackjackBetChipPlacement[] = position.chips,
): BlackjackBettingPosition {
  return Object.freeze({
    ...position,
    chips: Object.freeze(chips.map((chip) => Object.freeze({ ...chip }))),
  });
}

export function createBlackjackBettingPosition(input: {
  roundId: BlackjackRoundId;
  playerId: BlackjackPlayerId;
  userId: BlackjackUserId;
  seatNumber: BlackjackSeatNumber;
  bettingClosesAtMs: number;
  minBetCents: number;
  maxBetCents: number | null;
}): BlackjackBettingPosition {
  assertNonEmptyId("roundId", input.roundId);
  assertNonEmptyId("playerId", input.playerId);
  assertNonEmptyId("userId", input.userId);
  assertSafeNonNegativeInteger("bettingClosesAtMs", input.bettingClosesAtMs);
  assertPositiveMoney("minBetCents", input.minBetCents);

  if (input.maxBetCents !== null) {
    assertPositiveMoney("maxBetCents", input.maxBetCents);
    if (input.maxBetCents < input.minBetCents) {
      throw new RangeError("Blackjack maxBetCents cannot be below minBetCents");
    }
  }

  return freezePosition({
    ...input,
    status: "OPEN",
    chips: [],
  });
}

export function getBlackjackBetTotalCents(
  position: BlackjackBettingPosition,
): number {
  let total = 0;
  for (const chip of position.chips) {
    if (chip.status !== "ACTIVE") continue;
    total += chip.chipValueCents;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("Blackjack bet total exceeds safe integer range");
    }
  }
  return total;
}

function assertWithinMaxBet(
  position: BlackjackBettingPosition,
  nextTotalCents: number,
): void {
  if (
    position.maxBetCents !== null &&
    nextTotalCents > position.maxBetCents
  ) {
    throw new Error("Blackjack bet exceeds table maximum");
  }
}

export function placeBlackjackBetChip(
  wallet: BlackjackWalletLedgerState,
  book: BlackjackReservationBook,
  position: BlackjackBettingPosition,
  input: {
    reservationId: string;
    reserveTransactionId: string;
    chipValueCents: number;
    nowMs: number;
  },
): BlackjackBettingMutation {
  assertOwners(wallet, book, position);
  assertBettingOpen(position, input.nowMs);
  assertNonEmptyId("reservationId", input.reservationId);
  assertNonEmptyId("reserveTransactionId", input.reserveTransactionId);

  if (!isBlackjackChipDenominationCents(input.chipValueCents)) {
    throw new RangeError("Blackjack chip value is not a valid denomination");
  }

  const existingChip = position.chips.find(
    (chip) => chip.reservationId === input.reservationId,
  );
  if (existingChip) {
    if (
      existingChip.reserveTransactionId !== input.reserveTransactionId ||
      existingChip.chipValueCents !== input.chipValueCents ||
      existingChip.status !== "ACTIVE"
    ) {
      throw new Error(
        `Blackjack chip reservationId conflict: ${input.reservationId}`,
      );
    }

    const replay = reserveBlackjackWager(wallet, book, {
      reservationId: input.reservationId,
      reserveTransactionId: input.reserveTransactionId,
      userId: position.userId,
      roundId: position.roundId,
      handId: null,
      kind: "INITIAL",
      amountCents: input.chipValueCents,
      createdAtMs: input.nowMs,
    });

    return Object.freeze({
      wallet: replay.wallet,
      book: replay.book,
      position,
    });
  }

  const currentTotal = getBlackjackBetTotalCents(position);
  const nextTotal = currentTotal + input.chipValueCents;
  if (!Number.isSafeInteger(nextTotal)) {
    throw new RangeError("Blackjack bet total exceeds safe integer range");
  }
  assertWithinMaxBet(position, nextTotal);

  const reserved = reserveBlackjackWager(wallet, book, {
    reservationId: input.reservationId,
    reserveTransactionId: input.reserveTransactionId,
    userId: position.userId,
    roundId: position.roundId,
    handId: null,
    kind: "INITIAL",
    amountCents: input.chipValueCents,
    createdAtMs: input.nowMs,
  });

  const chip = Object.freeze({
    reservationId: input.reservationId,
    reserveTransactionId: input.reserveTransactionId,
    chipValueCents: input.chipValueCents,
    status: "ACTIVE" as const,
  });

  return Object.freeze({
    wallet: reserved.wallet,
    book: reserved.book,
    position: freezePosition(position, [...position.chips, chip]),
  });
}

export function undoLastBlackjackBetChip(
  wallet: BlackjackWalletLedgerState,
  book: BlackjackReservationBook,
  position: BlackjackBettingPosition,
  input: {
    expectedReservationId: string;
    releaseTransactionId: string;
    nowMs: number;
  },
): BlackjackBettingMutation {
  assertOwners(wallet, book, position);
  assertBettingOpen(position, input.nowMs);
  assertNonEmptyId("expectedReservationId", input.expectedReservationId);
  assertNonEmptyId("releaseTransactionId", input.releaseTransactionId);

  const releasedChip = position.chips.find(
    (chip) =>
      chip.reservationId === input.expectedReservationId &&
      chip.status === "RELEASED",
  );
  const expectedReservation = book.reservations.find(
    (candidate) =>
      candidate.reservationId === input.expectedReservationId,
  );
  if (
    releasedChip &&
    expectedReservation?.status === "RELEASED" &&
    expectedReservation.terminalTransactionId === input.releaseTransactionId
  ) {
    return Object.freeze({ wallet, book, position });
  }

  const activeChips = position.chips.filter((chip) => chip.status === "ACTIVE");
  const last = activeChips.at(-1);

  if (!last) {
    throw new Error("Blackjack bet has no active chip to undo");
  }

  if (last.reservationId !== input.expectedReservationId) {
    throw new Error("Blackjack undo request targets a stale chip");
  }

  const released = releaseBlackjackWagerReservation(wallet, book, {
    reservationId: last.reservationId,
    transactionId: input.releaseTransactionId,
    createdAtMs: input.nowMs,
  });

  const chips = position.chips.map((chip) =>
    chip.reservationId === last.reservationId
      ? { ...chip, status: "RELEASED" as const }
      : chip,
  );

  return Object.freeze({
    wallet: released.wallet,
    book: released.book,
    position: freezePosition(position, chips),
  });
}

export function clearBlackjackBet(
  wallet: BlackjackWalletLedgerState,
  book: BlackjackReservationBook,
  position: BlackjackBettingPosition,
  input: {
    clearTransactionId: string;
    nowMs: number;
  },
): BlackjackBettingMutation {
  assertOwners(wallet, book, position);
  assertBettingOpen(position, input.nowMs);
  assertNonEmptyId("clearTransactionId", input.clearTransactionId);

  const activeChips = position.chips.filter((chip) => chip.status === "ACTIVE");
  if (activeChips.length === 0) {
    return Object.freeze({ wallet, book, position });
  }

  let nextWallet = wallet;
  let nextBook = book;

  for (const chip of activeChips) {
    const released = releaseBlackjackWagerReservation(nextWallet, nextBook, {
      reservationId: chip.reservationId,
      transactionId: `${input.clearTransactionId}:${chip.reservationId}`,
      createdAtMs: input.nowMs,
    });
    nextWallet = released.wallet;
    nextBook = released.book;
  }

  const activeIds = new Set(activeChips.map((chip) => chip.reservationId));
  const chips = position.chips.map((chip) =>
    activeIds.has(chip.reservationId)
      ? { ...chip, status: "RELEASED" as const }
      : chip,
  );

  return Object.freeze({
    wallet: nextWallet,
    book: nextBook,
    position: freezePosition(position, chips),
  });
}

export function markBlackjackBetReady(
  position: BlackjackBettingPosition,
  nowMs: number,
): BlackjackBettingPosition {
  assertSafeNonNegativeInteger("nowMs", nowMs);

  if (position.status === "READY") return position;
  if (position.status !== "OPEN") {
    throw new Error("Blackjack bet cannot become READY from current status");
  }
  if (nowMs >= position.bettingClosesAtMs) {
    throw new Error("Blackjack betting window is closed");
  }

  const total = getBlackjackBetTotalCents(position);
  if (total < position.minBetCents) {
    throw new Error("Blackjack bet is below table minimum");
  }
  assertWithinMaxBet(position, total);

  return freezePosition({
    ...position,
    status: "READY",
  });
}

export function lockBlackjackReadyBet(
  position: BlackjackBettingPosition,
): BlackjackBettingPosition {
  if (position.status === "LOCKED") return position;
  if (position.status !== "READY") {
    throw new Error("Blackjack only READY bets can be locked");
  }
  return freezePosition({
    ...position,
    status: "LOCKED",
  });
}

export function bindBlackjackBetPositionToHand(
  book: BlackjackReservationBook,
  position: BlackjackBettingPosition,
  handId: string,
): BlackjackReservationBook {
  assertNonEmptyId("handId", handId);
  if (book.userId !== position.userId) {
    throw new Error("Blackjack betting reservation book owner mismatch");
  }
  if (position.status !== "READY" && position.status !== "LOCKED") {
    throw new Error("Blackjack bet must be READY before hand binding");
  }

  let nextBook = book;
  for (const chip of position.chips) {
    if (chip.status !== "ACTIVE") continue;
    nextBook = bindBlackjackReservationToHand(nextBook, {
      reservationId: chip.reservationId,
      handId,
    });
  }
  return nextBook;
}

export function getInitialDealParticipantFromBet(
  position: BlackjackBettingPosition,
): Readonly<{
  playerId: BlackjackPlayerId;
  seatNumber: BlackjackSeatNumber;
  betCents: number;
}> {
  if (position.status !== "READY" && position.status !== "LOCKED") {
    throw new Error("Blackjack initial deal requires a READY bet");
  }

  const betCents = getBlackjackBetTotalCents(position);
  if (betCents < position.minBetCents) {
    throw new Error("Blackjack READY bet is below table minimum");
  }
  assertWithinMaxBet(position, betCents);

  return Object.freeze({
    playerId: position.playerId,
    seatNumber: position.seatNumber,
    betCents,
  });
}
