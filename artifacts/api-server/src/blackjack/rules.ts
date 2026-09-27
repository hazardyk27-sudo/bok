import type {
  BlackjackCard,
  BlackjackHand,
  BlackjackHandResult,
} from "./domain";

export type BlackjackDealerSoft17Rule = "STAND" | "HIT";

export type BlackjackRuleConfig = Readonly<{
  deckCount: 6;
  blackjackPayoutNumerator: 3;
  blackjackPayoutDenominator: 2;
  dealerSoft17: BlackjackDealerSoft17Rule;
  doubleEnabled: boolean;
  doubleAfterSplit: boolean;
  splitEnabled: boolean;
  maxSplitHands: number;
  resplitAces: boolean;
  hitSplitAces: boolean;
  insuranceEnabled: boolean;
  lateSurrenderEnabled: boolean;
  turnSeconds: number;
  penetration: number;
}>;

export const BLACKJACK_RULES_V1: BlackjackRuleConfig = {
  deckCount: 6,
  blackjackPayoutNumerator: 3,
  blackjackPayoutDenominator: 2,
  dealerSoft17: "STAND",
  doubleEnabled: true,
  doubleAfterSplit: true,
  splitEnabled: true,
  maxSplitHands: 4,
  resplitAces: false,
  hitSplitAces: false,
  insuranceEnabled: false,
  lateSurrenderEnabled: false,
  turnSeconds: 15,
  penetration: 0.75,
};

export type BlackjackHandValue = Readonly<{
  total: number;
  isSoft: boolean;
  aceCount: number;
}>;

function cardBaseValue(card: BlackjackCard): number {
  if (card.rank === "A") return 11;
  if (card.rank === "K" || card.rank === "Q" || card.rank === "J") return 10;
  return Number(card.rank);
}

export function calculateHandValue(
  cards: readonly BlackjackCard[],
): BlackjackHandValue {
  let total = 0;
  let aceCount = 0;

  for (const card of cards) {
    total += cardBaseValue(card);
    if (card.rank === "A") aceCount += 1;
  }

  let acesReduced = 0;
  while (total > 21 && acesReduced < aceCount) {
    total -= 10;
    acesReduced += 1;
  }

  return {
    total,
    isSoft: aceCount > acesReduced,
    aceCount,
  };
}

export function isSoftHand(cards: readonly BlackjackCard[]): boolean {
  return calculateHandValue(cards).isSoft;
}

export function isBust(cards: readonly BlackjackCard[]): boolean {
  return calculateHandValue(cards).total > 21;
}

export function isNaturalBlackjack(hand: BlackjackHand): boolean {
  return (
    hand.origin === "INITIAL" &&
    hand.cards.length === 2 &&
    calculateHandValue(hand.cards).total === 21
  );
}

export function canHit(
  hand: BlackjackHand,
  rules: BlackjackRuleConfig = BLACKJACK_RULES_V1,
): boolean {
  if (hand.status !== "ACTIVE") return false;
  if (isBust(hand.cards)) return false;
  if (calculateHandValue(hand.cards).total >= 21) return false;
  if (hand.isDoubled) return false;
  if (hand.isSplitAce && !rules.hitSplitAces) return false;
  return true;
}

export function canStand(hand: BlackjackHand): boolean {
  return hand.status === "ACTIVE" && !isBust(hand.cards);
}

export function canDouble(
  hand: BlackjackHand,
  rules: BlackjackRuleConfig = BLACKJACK_RULES_V1,
): boolean {
  if (!rules.doubleEnabled) return false;
  if (hand.status !== "ACTIVE") return false;
  if (hand.cards.length !== 2) return false;
  if (hand.isDoubled) return false;
  if (isBust(hand.cards)) return false;
  if (hand.origin === "SPLIT" && !rules.doubleAfterSplit) return false;
  if (hand.isSplitAce && !rules.hitSplitAces) return false;
  return true;
}

export type BlackjackSplitContext = Readonly<{
  currentPlayerHandCount: number;
}>;

export function canSplit(
  hand: BlackjackHand,
  context: BlackjackSplitContext,
  rules: BlackjackRuleConfig = BLACKJACK_RULES_V1,
): boolean {
  if (!rules.splitEnabled) return false;
  if (hand.status !== "ACTIVE") return false;
  if (hand.cards.length !== 2) return false;
  if (hand.isDoubled) return false;
  if (context.currentPlayerHandCount >= rules.maxSplitHands) return false;

  const [left, right] = hand.cards;
  if (!left || !right || left.rank !== right.rank) return false;

  if (
    left.rank === "A" &&
    hand.origin === "SPLIT" &&
    !rules.resplitAces
  ) {
    return false;
  }

  return true;
}

export function dealerShouldHit(
  cards: readonly BlackjackCard[],
  rules: BlackjackRuleConfig = BLACKJACK_RULES_V1,
): boolean {
  const value = calculateHandValue(cards);
  if (value.total < 17) return true;
  if (value.total > 17) return false;
  return value.isSoft && rules.dealerSoft17 === "HIT";
}

export function resolveHandResult(
  hand: BlackjackHand,
  dealerCards: readonly BlackjackCard[],
): BlackjackHandResult {
  const playerValue = calculateHandValue(hand.cards);
  const dealerValue = calculateHandValue(dealerCards);
  const playerNatural = isNaturalBlackjack(hand);
  const dealerNatural =
    dealerCards.length === 2 && dealerValue.total === 21;

  if (playerValue.total > 21) return "LOSS";
  if (playerNatural && dealerNatural) return "PUSH";
  if (playerNatural) return "BLACKJACK_WIN";
  if (dealerNatural) return "LOSS";
  if (dealerValue.total > 21) return "WIN";
  if (playerValue.total > dealerValue.total) return "WIN";
  if (playerValue.total < dealerValue.total) return "LOSS";
  return "PUSH";
}

function assertValidStake(stakeCents: number): void {
  if (!Number.isSafeInteger(stakeCents) || stakeCents < 0) {
    throw new RangeError("Blackjack stake must be a non-negative safe integer number of cents");
  }
}

function assertSafeReturn(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Blackjack settlement return exceeds safe integer range");
  }
  return value;
}

export function calculateSettlementReturnCents(
  result: BlackjackHandResult,
  stakeCents: number,
  rules: BlackjackRuleConfig = BLACKJACK_RULES_V1,
): number {
  assertValidStake(stakeCents);

  if (result === "LOSS") return 0;
  if (result === "PUSH") return stakeCents;
  if (result === "WIN") return assertSafeReturn(stakeCents * 2);

  const blackjackProfitNumerator =
    stakeCents * rules.blackjackPayoutNumerator;
  if (blackjackProfitNumerator % rules.blackjackPayoutDenominator !== 0) {
    throw new RangeError(
      "Stake cannot be paid exactly at the configured Blackjack ratio",
    );
  }

  const profit =
    blackjackProfitNumerator / rules.blackjackPayoutDenominator;
  return assertSafeReturn(stakeCents + profit);
}
