import type {
  BlackjackHand,
  BlackjackHandResult,
  BlackjackPlayerId,
  BlackjackRound,
  BlackjackUserId,
} from "./domain";
import {
  type BlackjackFundsReservation,
  type BlackjackReservationBook,
  assertBlackjackReservationWalletConsistency,
  settleBlackjackWagerReservation,
} from "./reservations";
import {
  calculateSettlementReturnCents,
  resolveHandResult,
} from "./rules";
import type {
  BlackjackSettlementTransactionType,
  BlackjackWalletLedgerState,
} from "./walletLedger";

export type BlackjackSettlementAccount = Readonly<{
  playerId: BlackjackPlayerId;
  userId: BlackjackUserId;
  wallet: BlackjackWalletLedgerState;
  book: BlackjackReservationBook;
}>;

export type BlackjackSettlementHandSummary = Readonly<{
  handId: string;
  playerId: BlackjackPlayerId;
  result: BlackjackHandResult;
  stakeCents: number;
  returnCents: number;
  reservationCount: number;
}>;

export type BlackjackRoundSettlementResult = Readonly<{
  round: BlackjackRound;
  accounts: readonly BlackjackSettlementAccount[];
  hands: readonly BlackjackSettlementHandSummary[];
}>;

function assertNonEmptyId(label: string, value: string): void {
  if (!value.trim()) {
    throw new RangeError(`Blackjack ${label} must be a non-empty string`);
  }
}

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError("Blackjack settlement nowMs must be a non-negative safe integer");
  }
}

function safeSum(label: string, values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new RangeError(`Blackjack ${label} exceeds safe integer range`);
    }
  }
  return total;
}

function terminalTypeForResult(
  result: BlackjackHandResult,
): BlackjackSettlementTransactionType {
  if (result === "LOSS") return "LOSS_SETTLE";
  if (result === "PUSH") return "PUSH_RETURN";
  if (result === "BLACKJACK_WIN") return "BLACKJACK_PAYOUT";
  return "WIN_PAYOUT";
}

function settlementTransactionId(
  prefix: string,
  roundId: string,
  handId: string,
  reservationId: string,
): string {
  return `${prefix}:${roundId}:${handId}:${reservationId}`;
}

function freezeAccount(
  account: BlackjackSettlementAccount,
): BlackjackSettlementAccount {
  return Object.freeze({ ...account });
}

function buildAccountMap(
  accounts: readonly BlackjackSettlementAccount[],
): Map<BlackjackPlayerId, BlackjackSettlementAccount> {
  const map = new Map<BlackjackPlayerId, BlackjackSettlementAccount>();
  const seenUserIds = new Set<BlackjackUserId>();

  for (const account of accounts) {
    assertNonEmptyId("playerId", account.playerId);
    assertNonEmptyId("userId", account.userId);

    if (map.has(account.playerId)) {
      throw new Error("Blackjack settlement contains duplicate player account");
    }
    if (seenUserIds.has(account.userId)) {
      throw new Error("Blackjack settlement contains duplicate user account");
    }
    if (
      account.wallet.userId !== account.userId ||
      account.book.userId !== account.userId
    ) {
      throw new Error("Blackjack settlement account owner mismatch");
    }

    assertBlackjackReservationWalletConsistency(account.wallet, account.book);
    seenUserIds.add(account.userId);
    map.set(account.playerId, freezeAccount(account));
  }

  return map;
}

function reservationsForHand(
  account: BlackjackSettlementAccount,
  roundId: string,
  handId: string,
): readonly BlackjackFundsReservation[] {
  const reservations = account.book.reservations.filter(
    (reservation) =>
      reservation.roundId === roundId &&
      reservation.handId === handId,
  );

  if (reservations.length === 0) {
    throw new Error(`Blackjack hand ${handId} has no wager reservations`);
  }
  if (reservations.some((reservation) => reservation.status === "RELEASED")) {
    throw new Error(
      `Blackjack hand ${handId} contains a released wager reservation`,
    );
  }

  return reservations;
}

function validateNoOrphanReservedWagers(
  round: BlackjackRound,
  accounts: readonly BlackjackSettlementAccount[],
): void {
  const handIds = new Set(round.hands.map((hand) => hand.handId));

  for (const account of accounts) {
    const orphan = account.book.reservations.find(
      (reservation) =>
        reservation.roundId === round.roundId &&
        reservation.status === "RESERVED" &&
        (reservation.handId === null || !handIds.has(reservation.handId)),
    );
    if (orphan) {
      throw new Error(
        `Blackjack round has orphan reserved wager ${orphan.reservationId}`,
      );
    }
  }
}

type HandPlan = Readonly<{
  hand: BlackjackHand;
  account: BlackjackSettlementAccount;
  reservations: readonly BlackjackFundsReservation[];
  result: BlackjackHandResult;
  totalReturnCents: number;
  perReservationReturns: readonly number[];
}>;

function buildHandPlan(
  round: BlackjackRound,
  account: BlackjackSettlementAccount,
  hand: BlackjackHand,
): HandPlan {
  if (hand.status === "WAITING" || hand.status === "ACTIVE") {
    throw new Error("Blackjack settlement cannot resolve an active player hand");
  }

  const reservations = reservationsForHand(
    account,
    round.roundId,
    hand.handId,
  );
  const reservationStake = safeSum(
    "hand reserved stake",
    reservations.map((reservation) => reservation.amountCents),
  );

  if (reservationStake !== hand.betCents) {
    throw new Error(
      `Blackjack hand ${hand.handId} stake mismatch: hand=${hand.betCents}, reservations=${reservationStake}`,
    );
  }

  const result = resolveHandResult(hand, round.dealer.cards);
  const totalReturnCents = calculateSettlementReturnCents(
    result,
    hand.betCents,
  );
  const perReservationReturns = Object.freeze(
    reservations.map((reservation) =>
      calculateSettlementReturnCents(result, reservation.amountCents),
    ),
  );

  if (
    safeSum("reservation settlement returns", perReservationReturns) !==
    totalReturnCents
  ) {
    throw new Error(
      `Blackjack hand ${hand.handId} reservation payout does not match hand payout`,
    );
  }

  return Object.freeze({
    hand,
    account,
    reservations,
    result,
    totalReturnCents,
    perReservationReturns,
  });
}

export function settleBlackjackRound(
  round: BlackjackRound,
  accounts: readonly BlackjackSettlementAccount[],
  input: {
    transactionIdPrefix: string;
    nowMs: number;
  },
): BlackjackRoundSettlementResult {
  assertNonEmptyId("transactionIdPrefix", input.transactionIdPrefix);
  assertNowMs(input.nowMs);

  if (round.phase !== "SETTLEMENT") {
    throw new Error("Blackjack settlement requires SETTLEMENT phase");
  }
  if (round.currentTurn !== null) {
    throw new Error("Blackjack settlement requires no active player turn");
  }
  if (!round.dealer.holeCardRevealed) {
    throw new Error("Blackjack settlement requires the dealer hole card revealed");
  }
  if (round.hands.length === 0) {
    throw new Error("Blackjack settlement requires at least one player hand");
  }
  if (round.dealer.cards.length < 2) {
    throw new Error("Blackjack settlement requires at least two dealer cards");
  }

  const handIds = new Set(round.hands.map((hand) => hand.handId));
  if (handIds.size !== round.hands.length) {
    throw new Error("Blackjack settlement round contains duplicate handId values");
  }

  const accountMap = buildAccountMap(accounts);

  for (const hand of round.hands) {
    if (!accountMap.has(hand.playerId)) {
      throw new Error(
        `Blackjack settlement account missing for player ${hand.playerId}`,
      );
    }
  }

  validateNoOrphanReservedWagers(round, accounts);

  const plans = round.hands.map((hand) =>
    buildHandPlan(round, accountMap.get(hand.playerId)!, hand),
  );

  const mutableAccounts = new Map(accountMap);
  const summaries: BlackjackSettlementHandSummary[] = [];
  const completedHands: BlackjackHand[] = [];

  for (const plan of plans) {
    let account = mutableAccounts.get(plan.hand.playerId)!;

    for (let index = 0; index < plan.reservations.length; index += 1) {
      const reservation = plan.reservations[index];
      const returnCents = plan.perReservationReturns[index];

      const settled = settleBlackjackWagerReservation(
        account.wallet,
        account.book,
        {
          reservationId: reservation.reservationId,
          transactionId: settlementTransactionId(
            input.transactionIdPrefix,
            round.roundId,
            plan.hand.handId,
            reservation.reservationId,
          ),
          type: terminalTypeForResult(plan.result),
          returnCents,
          createdAtMs: input.nowMs,
        },
      );

      account = freezeAccount({
        ...account,
        wallet: settled.wallet,
        book: settled.book,
      });
    }

    mutableAccounts.set(plan.hand.playerId, account);

    completedHands.push(
      Object.freeze({
        ...plan.hand,
        status: "COMPLETE" as const,
        result: plan.result,
        payoutCents: plan.totalReturnCents,
      }),
    );

    summaries.push(
      Object.freeze({
        handId: plan.hand.handId,
        playerId: plan.hand.playerId,
        result: plan.result,
        stakeCents: plan.hand.betCents,
        returnCents: plan.totalReturnCents,
        reservationCount: plan.reservations.length,
      }),
    );
  }

  const outputAccounts = Object.freeze(
    accounts.map((account) =>
      mutableAccounts.get(account.playerId) ?? freezeAccount(account),
    ),
  );

  for (const account of outputAccounts) {
    assertBlackjackReservationWalletConsistency(account.wallet, account.book);
  }

  const settledRound: BlackjackRound = Object.freeze({
    ...round,
    phase: "ROUND_END" as const,
    hands: Object.freeze(completedHands),
    currentTurn: null,
    finishedAtMs: input.nowMs,
  });

  return Object.freeze({
    round: settledRound,
    accounts: outputAccounts,
    hands: Object.freeze(summaries),
  });
}
