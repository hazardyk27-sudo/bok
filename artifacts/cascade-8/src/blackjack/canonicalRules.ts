import {
  evaluateBlackjackHand,
  type BlackjackCard,
  type BlackjackRank,
} from "./blackjackCore";

/**
 * Canonical table rules for OYUN Blackjack.
 *
 * Blackjack has table/casino variations, so this manifest deliberately fixes
 * one coherent ruleset instead of relying on ambiguous "standard" defaults.
 * The selected profile is a six-deck American hole-card game with H17.
 */
export const BLACKJACK_CANONICAL_RULES = {
  profile: "6-DECK AMERICAN H17",
  deckCount: 6,
  dealerHoleCard: true,
  dealerPeeksForBlackjack: true,
  dealerHitsSoft17: true,
  blackjackProfitPayout: 1.5,
  blackjackTotalReturnMultiplier: 2.5,
  normalWinProfitPayout: 1,
  normalWinTotalReturnMultiplier: 2,
  pushTotalReturnMultiplier: 1,
  insuranceOfferedOnDealerAce: true,
  insuranceStakeFraction: 0.5,
  insuranceProfitPayout: 2,
  doubleOnAnyInitialTwoCards: true,
  doubleAfterSplit: true,
  splitEqualValueCards: true,
  maxHandsPerSeat: 4,
  resplitAces: false,
  hitSplitAces: false,
  splitTwentyOneIsNaturalBlackjack: false,
  surrender: false,
  cutCardPenetration: 0.75,
} as const;

const VALID_RANKS = new Set<BlackjackRank>([
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
]);

export function isBlackjackRank(value: string): value is BlackjackRank {
  return VALID_RANKS.has(value as BlackjackRank);
}

export function formatBlackjackHandTotal(cards: readonly BlackjackCard[]): string {
  const value = evaluateBlackjackHand(cards);
  if (value.soft && !value.bust) {
    return `${value.total - 10} / ${value.total}`;
  }
  return String(value.total);
}

export function formatBlackjackRanksTotal(ranks: readonly BlackjackRank[]): string {
  const cards: BlackjackCard[] = ranks.map((rank, index) => ({
    id: `display-${index}`,
    suit: "spades",
    rank,
    deck: 0,
  }));
  return formatBlackjackHandTotal(cards);
}

export const BLACKJACK_RULES_DISCLOSURE = [
  "6 decks · American hole-card game",
  "Dealer hits soft 17 (H17) and peeks for Blackjack",
  "Natural Blackjack (first 2 cards A + 10-value) pays 3:2",
  "Normal win pays 1:1 · push returns stake",
  "Double on any first 2 cards · one card only · double after split allowed",
  "Split equal-value cards · maximum 4 hands per seat",
  "Split Aces receive one card each · no hit or re-split Aces",
  "21 after split/hit/double is not a natural Blackjack and pays 1:1",
  "Insurance only versus dealer Ace · up to 1/2 stake · pays 2:1",
  "No surrender",
] as const;
