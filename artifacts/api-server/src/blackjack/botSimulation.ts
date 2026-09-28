import type {
  BlackjackCard,
  BlackjackRound,
  BlackjackSeatNumber,
  BlackjackShoe,
} from "./domain";
import { playBlackjackDealerTurn } from "./dealer";
import { dealInitialBlackjackCards } from "./initialDeal";
import {
  markBlackjackReshuffleAfterRound,
  prepareBlackjackShoeBeforeRound,
} from "./lifecycle";
import {
  createBlackjackReservationBook,
  reserveBlackjackWager,
  assertBlackjackReservationWalletConsistency,
} from "./reservations";
import {
  calculateHandValue,
  canDouble,
  canSplit,
} from "./rules";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { splitBlackjackCurrentHand } from "./split";
import { doubleBlackjackCurrentHand } from "./double";
import { hitBlackjackCurrentHand } from "./hit";
import { standBlackjackCurrentHand } from "./stand";
import {
  settleBlackjackRound,
  type BlackjackSettlementAccount,
} from "./settlement";
import { startBlackjackPlayerTurns } from "./turnEngine";
import { createBlackjackWalletLedgerState } from "./walletLedger";

const BOT_COUNT = 5;
const BASE_BET_CENTS = 1_000;
const INITIAL_BALANCE_CENTS = 10_000_000;
const MIN_SAFE_CARDS_BEFORE_ROUND = 80;
const MAX_ACTIONS_PER_ROUND = 250;

type MutableBotAccount = {
  playerId: string;
  userId: string;
  wallet: ReturnType<typeof createBlackjackWalletLedgerState>;
  book: ReturnType<typeof createBlackjackReservationBook>;
};

export type BlackjackBotSimulationSummary = Readonly<{
  roundsCompleted: number;
  totalActions: number;
  hitActions: number;
  standActions: number;
  doubleActions: number;
  splitActions: number;
  shoesCreated: number;
  maximumHandsInRound: number;
  finalShoeIndex: number;
  finalBalancesCents: readonly number[];
}>;

function deterministicShoe(
  shoeNumber: number,
  rigOpening = false,
): BlackjackShoe {
  const base = createUnshuffledBlackjackShoe({
    shoeId: "bot-shoe-" + shoeNumber,
    createdAtMs: shoeNumber,
  });

  let cards = [...base.cards];
  const rotation = (shoeNumber * 37) % cards.length;
  cards = [...cards.slice(rotation), ...cards.slice(0, rotation)];

  const moveRankTo = (rank: BlackjackCard["rank"], target: number) => {
    const source = cards.findIndex(
      (card, index) => index >= 12 && card.rank === rank,
    );
    if (source < 0) throw new Error("Bot simulation rank not found");
    [cards[target], cards[source]] = [cards[source], cards[target]];
  };

  if (rigOpening) {
    // Five players initial order:
    // P1,P2,P3,P4,P5,D,P1,P2,P3,P4,P5,D.
    moveRankTo("8", 0);
    moveRankTo("8", 6);
    moveRankTo("5", 1);
    moveRankTo("6", 7);
    moveRankTo("10", 5);
    moveRankTo("7", 11);
  }

  return Object.freeze({
    ...base,
    cards: Object.freeze(cards),
    shuffleAlgorithmVersion: "bot-deterministic-v1",
  });
}

function botParticipants() {
  return Array.from({ length: BOT_COUNT }, (_, index) => ({
    playerId: "bot-player-" + (index + 1),
    seatNumber: (index + 1) as BlackjackSeatNumber,
    betCents: BASE_BET_CENTS,
  }));
}

function createAccounts(): Map<string, MutableBotAccount> {
  return new Map(
    Array.from({ length: BOT_COUNT }, (_, index) => {
      const playerId = "bot-player-" + (index + 1);
      const userId = "bot-user-" + (index + 1);
      return [
        playerId,
        {
          playerId,
          userId,
          wallet: createBlackjackWalletLedgerState({
            userId,
            totalBalanceCents: INITIAL_BALANCE_CENTS,
          }),
          book: createBlackjackReservationBook(userId),
        },
      ] as const;
    }),
  );
}

function reserveInitialBets(
  accounts: Map<string, MutableBotAccount>,
  roundId: string,
): void {
  for (let seat = 1; seat <= BOT_COUNT; seat += 1) {
    const playerId = "bot-player-" + seat;
    const account = accounts.get(playerId);
    if (!account) throw new Error("Bot account missing");

    const handId = roundId + ":seat-" + seat + ":initial";
    const reserved = reserveBlackjackWager(account.wallet, account.book, {
      reservationId: roundId + ":base:" + playerId,
      reserveTransactionId: roundId + ":base-tx:" + playerId,
      userId: account.userId,
      roundId,
      handId,
      kind: "INITIAL",
      amountCents: BASE_BET_CENTS,
      createdAtMs: Number(roundId.split("-").at(-1) ?? "0"),
    });

    account.wallet = reserved.wallet;
    account.book = reserved.book;
  }
}

function assertNoDuplicateCards(round: BlackjackRound): void {
  const ids = [
    ...round.dealer.cards.map((card) => card.cardId),
    ...round.hands.flatMap((hand) => hand.cards.map((card) => card.cardId)),
  ];
  if (new Set(ids).size !== ids.length) {
    throw new Error("Bot simulation detected duplicate physical card");
  }
}

function accountList(
  accounts: Map<string, MutableBotAccount>,
): readonly BlackjackSettlementAccount[] {
  return [...accounts.values()].map((account) => ({
    playerId: account.playerId,
    userId: account.userId,
    wallet: account.wallet,
    book: account.book,
  }));
}

export function runBlackjackFiveBotSimulation(
  roundCount: number,
): BlackjackBotSimulationSummary {
  if (!Number.isSafeInteger(roundCount) || roundCount < 1) {
    throw new RangeError("Bot simulation roundCount must be positive integer");
  }

  const accounts = createAccounts();
  let shoeNumber = 1;
  let shoesCreated = 1;
  let shoe = deterministicShoe(shoeNumber, true);
  let nowMs = 1_000;
  let totalActions = 0;
  let hitActions = 0;
  let standActions = 0;
  let doubleActions = 0;
  let splitActions = 0;
  let maximumHandsInRound = 0;

  for (let roundNumber = 1; roundNumber <= roundCount; roundNumber += 1) {
    shoe = prepareBlackjackShoeBeforeRound({
      currentShoe: shoe,
      minimumCardsRequired: MIN_SAFE_CARDS_BEFORE_ROUND,
      createFreshShoe: () => {
        shoeNumber += 1;
        shoesCreated += 1;
        return deterministicShoe(shoeNumber);
      },
    });

    const roundId = "bot-round-" + roundNumber;
    reserveInitialBets(accounts, roundId);

    const deal = dealInitialBlackjackCards({
      roundId,
      shoe,
      participants: botParticipants(),
    });
    shoe = deal.shoe;

    let round: BlackjackRound = {
      roundId,
      roundNumber,
      phase: "INITIAL_DEAL",
      activeSeatOrder: deal.activeSeatOrder,
      hands: deal.hands,
      dealer: deal.dealer,
      currentTurn: null,
      startedAtMs: nowMs,
      bettingClosesAtMs: nowMs,
      finishedAtMs: null,
    };

    round = startBlackjackPlayerTurns(round, nowMs);
    let actionsThisRound = 0;

    while (round.phase === "PLAYER_TURNS") {
      actionsThisRound += 1;
      totalActions += 1;
      nowMs += 1;

      if (actionsThisRound > MAX_ACTIONS_PER_ROUND) {
        throw new Error("Bot simulation round action cap exceeded");
      }
      if (!round.currentTurn) {
        throw new Error("Bot simulation PLAYER_TURNS missing currentTurn");
      }

      const hand = round.hands.find(
        (candidate) => candidate.handId === round.currentTurn?.handId,
      );
      if (!hand) throw new Error("Bot simulation current hand missing");

      const account = accounts.get(hand.playerId);
      if (!account) throw new Error("Bot simulation account missing");

      const currentPlayerHandCount = round.hands.filter(
        (candidate) => candidate.playerId === hand.playerId,
      ).length;
      const total = calculateHandValue(hand.cards).total;

      const shouldSplit =
        canSplit(hand, { currentPlayerHandCount }) &&
        account.wallet.availableBalanceCents >= hand.betCents;
      const shouldDouble =
        !shouldSplit &&
        canDouble(hand) &&
        total >= 9 &&
        total <= 11 &&
        account.wallet.availableBalanceCents >= hand.betCents;

      if (shouldSplit) {
        const result = splitBlackjackCurrentHand(
          round,
          shoe,
          account.wallet,
          account.book,
          {
            expectedHandId: hand.handId,
            expectedSeatNumber: hand.seatNumber,
            userId: account.userId,
            reservationId:
              roundId + ":split:" + hand.handId + ":" + currentPlayerHandCount,
            reserveTransactionId:
              roundId + ":split-tx:" + hand.handId + ":" + currentPlayerHandCount,
            nowMs,
          },
        );
        round = result.round;
        shoe = result.shoe;
        account.wallet = result.wallet;
        account.book = result.book;
        splitActions += 1;
      } else if (shouldDouble) {
        const result = doubleBlackjackCurrentHand(
          round,
          shoe,
          account.wallet,
          account.book,
          {
            expectedHandId: hand.handId,
            expectedSeatNumber: hand.seatNumber,
            userId: account.userId,
            reservationId: roundId + ":double:" + hand.handId,
            reserveTransactionId: roundId + ":double-tx:" + hand.handId,
            nowMs,
          },
        );
        round = result.round;
        shoe = result.shoe;
        account.wallet = result.wallet;
        account.book = result.book;
        doubleActions += 1;
      } else if (total < 17) {
        const result = hitBlackjackCurrentHand(round, shoe, {
          expectedHandId: hand.handId,
          expectedSeatNumber: hand.seatNumber,
          nowMs,
        });
        round = result.round;
        shoe = result.shoe;
        hitActions += 1;
      } else {
        round = standBlackjackCurrentHand(round, {
          expectedHandId: hand.handId,
          expectedSeatNumber: hand.seatNumber,
          nowMs,
        }).round;
        standActions += 1;
      }

      maximumHandsInRound = Math.max(
        maximumHandsInRound,
        round.hands.length,
      );
    }

    if (round.phase !== "DEALER_TURN") {
      throw new Error("Bot simulation did not reach DEALER_TURN");
    }

    nowMs += 1;
    const dealer = playBlackjackDealerTurn(round, shoe);
    round = dealer.round;
    shoe = dealer.shoe;

    assertNoDuplicateCards(round);

    nowMs += 1;
    const settled = settleBlackjackRound(round, accountList(accounts), {
      transactionIdPrefix: "bot-settle",
      nowMs,
    });
    round = settled.round;

    for (const settledAccount of settled.accounts) {
      const account = accounts.get(settledAccount.playerId);
      if (!account) throw new Error("Settled bot account missing");
      account.wallet = settledAccount.wallet;
      account.book = settledAccount.book;
      assertBlackjackReservationWalletConsistency(
        account.wallet,
        account.book,
      );
      if (account.wallet.reservedBalanceCents !== 0) {
        throw new Error("Bot simulation leaked reserved balance after round");
      }
    }

    if (
      round.phase !== "ROUND_END" ||
      round.hands.some((hand) => hand.status !== "COMPLETE")
    ) {
      throw new Error("Bot simulation round did not settle completely");
    }

    shoe = markBlackjackReshuffleAfterRound(shoe);
  }

  return Object.freeze({
    roundsCompleted: roundCount,
    totalActions,
    hitActions,
    standActions,
    doubleActions,
    splitActions,
    shoesCreated,
    maximumHandsInRound,
    finalShoeIndex: shoe.nextIndex,
    finalBalancesCents: Object.freeze(
      [...accounts.values()].map(
        (account) =>
          account.wallet.availableBalanceCents +
          account.wallet.reservedBalanceCents,
      ),
    ),
  });
}
