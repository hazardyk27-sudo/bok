import type { BlackjackShoe } from "./domain";
import { getBlackjackShoeRemainingCards } from "./draw";
import { validateBlackjackShoeComposition } from "./shoe";

export const BLACKJACK_TARGET_PENETRATION = 0.75 as const;

function assertPenetrationTarget(target: number): void {
  if (!Number.isFinite(target) || target <= 0 || target >= 1) {
    throw new RangeError(
      "Blackjack penetration target must be greater than 0 and less than 1",
    );
  }
}

function assertMinimumCardsRequired(minimumCardsRequired: number): void {
  if (
    !Number.isSafeInteger(minimumCardsRequired) ||
    minimumCardsRequired < 1
  ) {
    throw new RangeError(
      "Blackjack minimum cards required must be a positive safe integer",
    );
  }
}

export function getBlackjackShoePenetration(shoe: BlackjackShoe): number {
  getBlackjackShoeRemainingCards(shoe);

  if (shoe.cards.length <= 0) {
    throw new RangeError("Blackjack shoe must contain cards");
  }

  return shoe.nextIndex / shoe.cards.length;
}

export function markBlackjackReshuffleAfterRound(
  shoe: BlackjackShoe,
  target: number = BLACKJACK_TARGET_PENETRATION,
): BlackjackShoe {
  assertPenetrationTarget(target);

  if (shoe.reshufflePending) return shoe;

  if (getBlackjackShoePenetration(shoe) < target) {
    return shoe;
  }

  return Object.freeze({
    ...shoe,
    reshufflePending: true,
  });
}

export function shouldReshuffleBlackjackBeforeRound(
  shoe: BlackjackShoe,
  minimumCardsRequired: number,
): boolean {
  assertMinimumCardsRequired(minimumCardsRequired);

  return (
    shoe.reshufflePending ||
    getBlackjackShoeRemainingCards(shoe) < minimumCardsRequired
  );
}

export function prepareBlackjackShoeBeforeRound(input: {
  currentShoe: BlackjackShoe;
  minimumCardsRequired: number;
  createFreshShoe: () => BlackjackShoe;
}): BlackjackShoe {
  if (
    !shouldReshuffleBlackjackBeforeRound(
      input.currentShoe,
      input.minimumCardsRequired,
    )
  ) {
    return input.currentShoe;
  }

  const freshShoe = input.createFreshShoe();

  if (freshShoe.shoeId === input.currentShoe.shoeId) {
    throw new Error("Fresh Blackjack shoe must have a new shoeId");
  }

  if (!validateBlackjackShoeComposition(freshShoe.cards)) {
    throw new Error("Fresh Blackjack shoe has invalid composition");
  }

  if (freshShoe.nextIndex !== 0) {
    throw new Error("Fresh Blackjack shoe must start at nextIndex 0");
  }

  if (freshShoe.reshufflePending) {
    throw new Error("Fresh Blackjack shoe cannot start reshufflePending");
  }

  return freshShoe;
}
