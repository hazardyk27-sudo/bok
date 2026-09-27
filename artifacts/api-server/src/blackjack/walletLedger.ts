import type {
  BlackjackHandId,
  BlackjackRoundId,
  BlackjackTransactionId,
  BlackjackUserId,
  BlackjackWalletTransactionType,
} from "./domain";

export type BlackjackReserveTransactionType =
  | "BET_RESERVE"
  | "DOUBLE_RESERVE"
  | "SPLIT_RESERVE";

export type BlackjackSettlementTransactionType =
  | "LOSS_SETTLE"
  | "WIN_PAYOUT"
  | "BLACKJACK_PAYOUT"
  | "PUSH_RETURN";

export type BlackjackWalletLedgerEntry = Readonly<{
  transactionId: BlackjackTransactionId;
  userId: BlackjackUserId;
  roundId: BlackjackRoundId;
  handId: BlackjackHandId | null;
  type: BlackjackWalletTransactionType;
  amountCents: number;
  availableDeltaCents: number;
  reservedDeltaCents: number;
  createdAtMs: number;
}>;

export type BlackjackWalletLedgerState = Readonly<{
  userId: BlackjackUserId;
  availableBalanceCents: number;
  reservedBalanceCents: number;
  entries: readonly BlackjackWalletLedgerEntry[];
}>;

function assertNonEmptyId(label: string, value: string): void {
  if (!value.trim()) {
    throw new RangeError(`Blackjack ${label} must be a non-empty string`);
  }
}

function assertMoneyCents(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `Blackjack ${label} must be a non-negative safe integer number of cents`,
    );
  }
}

function assertPositiveMoneyCents(label: string, value: number): void {
  assertMoneyCents(label, value);
  if (value === 0) {
    throw new RangeError(`Blackjack ${label} must be greater than zero`);
  }
}

function assertCreatedAtMs(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Blackjack ledger createdAtMs must be a non-negative safe integer",
    );
  }
}

function safeAdd(label: string, left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Blackjack ${label} cannot advance safely`);
  }
  return value;
}

function freezeEntry(
  entry: BlackjackWalletLedgerEntry,
): BlackjackWalletLedgerEntry {
  return Object.freeze({ ...entry });
}

function sameEntry(
  left: BlackjackWalletLedgerEntry,
  right: BlackjackWalletLedgerEntry,
): boolean {
  return (
    left.transactionId === right.transactionId &&
    left.userId === right.userId &&
    left.roundId === right.roundId &&
    left.handId === right.handId &&
    left.type === right.type &&
    left.amountCents === right.amountCents &&
    left.availableDeltaCents === right.availableDeltaCents &&
    left.reservedDeltaCents === right.reservedDeltaCents &&
    left.createdAtMs === right.createdAtMs
  );
}

function applyEntry(
  state: BlackjackWalletLedgerState,
  entry: BlackjackWalletLedgerEntry,
): BlackjackWalletLedgerState {
  const existing = state.entries.find(
    (candidate) => candidate.transactionId === entry.transactionId,
  );

  if (existing) {
    if (!sameEntry(existing, entry)) {
      throw new Error(
        `Blackjack transactionId conflict: ${entry.transactionId}`,
      );
    }
    return state;
  }

  const availableBalanceCents = safeAdd(
    "available balance",
    state.availableBalanceCents,
    entry.availableDeltaCents,
  );
  const reservedBalanceCents = safeAdd(
    "reserved balance",
    state.reservedBalanceCents,
    entry.reservedDeltaCents,
  );

  return Object.freeze({
    ...state,
    availableBalanceCents,
    reservedBalanceCents,
    entries: Object.freeze([...state.entries, freezeEntry(entry)]),
  });
}

function validateCommonTransaction(input: {
  transactionId: string;
  userId: string;
  roundId: string;
  handId: string | null;
  createdAtMs: number;
}): void {
  assertNonEmptyId("transactionId", input.transactionId);
  assertNonEmptyId("userId", input.userId);
  assertNonEmptyId("roundId", input.roundId);
  if (input.handId !== null) {
    assertNonEmptyId("handId", input.handId);
  }
  assertCreatedAtMs(input.createdAtMs);
}

function assertWalletOwner(
  state: BlackjackWalletLedgerState,
  userId: string,
): void {
  if (state.userId !== userId) {
    throw new Error("Blackjack wallet userId does not match transaction userId");
  }
}

export function createBlackjackWalletLedgerState(input: {
  userId: BlackjackUserId;
  totalBalanceCents: number;
}): BlackjackWalletLedgerState {
  assertNonEmptyId("userId", input.userId);
  assertMoneyCents("totalBalanceCents", input.totalBalanceCents);

  return Object.freeze({
    userId: input.userId,
    availableBalanceCents: input.totalBalanceCents,
    reservedBalanceCents: 0,
    entries: Object.freeze([]),
  });
}

export function getBlackjackWalletTotalBalanceCents(
  state: BlackjackWalletLedgerState,
): number {
  return safeAdd(
    "total balance",
    state.availableBalanceCents,
    state.reservedBalanceCents,
  );
}

export function reserveBlackjackFunds(
  state: BlackjackWalletLedgerState,
  input: {
    transactionId: BlackjackTransactionId;
    userId: BlackjackUserId;
    roundId: BlackjackRoundId;
    handId: BlackjackHandId | null;
    type: BlackjackReserveTransactionType;
    amountCents: number;
    createdAtMs: number;
  },
): BlackjackWalletLedgerState {
  validateCommonTransaction(input);
  assertWalletOwner(state, input.userId);
  assertPositiveMoneyCents("reserve amountCents", input.amountCents);

  if (state.availableBalanceCents < input.amountCents) {
    throw new Error("Blackjack wallet has insufficient available balance");
  }

  return applyEntry(
    state,
    freezeEntry({
      ...input,
      availableDeltaCents: -input.amountCents,
      reservedDeltaCents: input.amountCents,
    }),
  );
}

export function releaseBlackjackReservedFunds(
  state: BlackjackWalletLedgerState,
  input: {
    transactionId: BlackjackTransactionId;
    userId: BlackjackUserId;
    roundId: BlackjackRoundId;
    handId: BlackjackHandId | null;
    amountCents: number;
    createdAtMs: number;
  },
): BlackjackWalletLedgerState {
  validateCommonTransaction(input);
  assertWalletOwner(state, input.userId);
  assertPositiveMoneyCents("release amountCents", input.amountCents);

  if (state.reservedBalanceCents < input.amountCents) {
    throw new Error("Blackjack wallet cannot release more than reserved balance");
  }

  return applyEntry(
    state,
    freezeEntry({
      ...input,
      type: "BET_RELEASE",
      availableDeltaCents: input.amountCents,
      reservedDeltaCents: -input.amountCents,
    }),
  );
}

export function settleBlackjackReservedFunds(
  state: BlackjackWalletLedgerState,
  input: {
    transactionId: BlackjackTransactionId;
    userId: BlackjackUserId;
    roundId: BlackjackRoundId;
    handId: BlackjackHandId;
    type: BlackjackSettlementTransactionType;
    reservedStakeCents: number;
    returnCents: number;
    createdAtMs: number;
  },
): BlackjackWalletLedgerState {
  validateCommonTransaction(input);
  assertWalletOwner(state, input.userId);
  assertPositiveMoneyCents("reservedStakeCents", input.reservedStakeCents);
  assertMoneyCents("returnCents", input.returnCents);

  if (state.reservedBalanceCents < input.reservedStakeCents) {
    throw new Error("Blackjack settlement exceeds reserved balance");
  }

  if (input.type === "LOSS_SETTLE" && input.returnCents !== 0) {
    throw new Error("Blackjack LOSS_SETTLE must return zero cents");
  }
  if (input.type === "PUSH_RETURN" && input.returnCents !== input.reservedStakeCents) {
    throw new Error("Blackjack PUSH_RETURN must return exactly the reserved stake");
  }
  if (
    (input.type === "WIN_PAYOUT" || input.type === "BLACKJACK_PAYOUT") &&
    input.returnCents <= input.reservedStakeCents
  ) {
    throw new Error("Blackjack winning settlement must return more than the reserved stake");
  }

  return applyEntry(
    state,
    freezeEntry({
      transactionId: input.transactionId,
      userId: input.userId,
      roundId: input.roundId,
      handId: input.handId,
      type: input.type,
      amountCents: input.returnCents,
      availableDeltaCents: input.returnCents,
      reservedDeltaCents: -input.reservedStakeCents,
      createdAtMs: input.createdAtMs,
    }),
  );
}
