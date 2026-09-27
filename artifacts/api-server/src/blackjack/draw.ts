import type { BlackjackCard, BlackjackShoe } from "./domain";

export class BlackjackShoeExhaustedError extends Error {
  constructor(shoeId: string) {
    super(`Blackjack shoe ${shoeId} is exhausted`);
    this.name = "BlackjackShoeExhaustedError";
  }
}

function assertShoeCursor(shoe: BlackjackShoe): void {
  if (!Number.isSafeInteger(shoe.nextIndex)) {
    throw new RangeError("Blackjack shoe nextIndex must be a safe integer");
  }
  if (shoe.nextIndex < 0 || shoe.nextIndex > shoe.cards.length) {
    throw new RangeError(
      "Blackjack shoe nextIndex must stay within the shoe card bounds",
    );
  }
}

export function getBlackjackShoeRemainingCards(shoe: BlackjackShoe): number {
  assertShoeCursor(shoe);
  return shoe.cards.length - shoe.nextIndex;
}

export type BlackjackDrawResult = Readonly<{
  card: BlackjackCard;
  shoe: BlackjackShoe;
}>;

export function drawNextBlackjackCard(
  shoe: BlackjackShoe,
): BlackjackDrawResult {
  assertShoeCursor(shoe);

  if (shoe.nextIndex >= shoe.cards.length) {
    throw new BlackjackShoeExhaustedError(shoe.shoeId);
  }

  const card = shoe.cards[shoe.nextIndex];
  if (!card) {
    throw new BlackjackShoeExhaustedError(shoe.shoeId);
  }

  const nextShoe: BlackjackShoe = Object.freeze({
    ...shoe,
    nextIndex: shoe.nextIndex + 1,
  });

  return Object.freeze({
    card,
    shoe: nextShoe,
  });
}
