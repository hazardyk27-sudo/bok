import { describe, expect, it } from "vitest";
import type { BlackjackShoe } from "./domain";
import { dealInitialBlackjackCards } from "./initialDeal";
import { createUnshuffledBlackjackShoe } from "./shoe";

function shoe(shoeId: string) {
  return createUnshuffledBlackjackShoe({
    shoeId,
    createdAtMs: 1,
  });
}

describe("blackjack deterministic initial deal", () => {
  it("sorts active players by seat number regardless of join/request order", () => {
    const result = dealInitialBlackjackCards({
      roundId: "round-1",
      shoe: shoe("deal-order"),
      participants: [
        { playerId: "p5", seatNumber: 5, betCents: 500 },
        { playerId: "p1", seatNumber: 1, betCents: 100 },
        { playerId: "p3", seatNumber: 3, betCents: 300 },
      ],
    });

    expect(result.activeSeatOrder).toEqual([1, 3, 5]);
    expect(result.hands.map((hand) => hand.seatNumber)).toEqual([1, 3, 5]);

    expect(
      result.events.map((event) =>
        event.recipient === "PLAYER"
          ? `P${event.seatNumber}-${event.pass}`
          : `D-${event.pass}`,
      ),
    ).toEqual([
      "P1-1",
      "P3-1",
      "P5-1",
      "D-1",
      "P1-2",
      "P3-2",
      "P5-2",
      "D-2",
    ]);
  });

  it("consumes exactly 2N + 2 cards for one through five players", () => {
    for (let count = 1; count <= 5; count += 1) {
      const participants = Array.from({ length: count }, (_, index) => ({
        playerId: `p-${count}-${index + 1}`,
        seatNumber: (index + 1) as 1 | 2 | 3 | 4 | 5,
        betCents: 100,
      }));
      const source = shoe(`deal-count-${count}`);
      const result = dealInitialBlackjackCards({
        roundId: `round-${count}`,
        shoe: source,
        participants,
      });

      expect(result.hands).toHaveLength(count);
      expect(result.dealer.cards).toHaveLength(2);
      expect(result.events).toHaveLength(count * 2 + 2);
      expect(result.shoe.nextIndex).toBe(source.nextIndex + count * 2 + 2);
    }
  });

  it("uses only the locked shoe order and never mutates the source shoe", () => {
    const source = shoe("deal-locked-order");
    const expected = source.cards.slice(0, 8);

    const result = dealInitialBlackjackCards({
      roundId: "round-locked",
      shoe: source,
      participants: [
        { playerId: "p1", seatNumber: 1, betCents: 100 },
        { playerId: "p4", seatNumber: 4, betCents: 400 },
        { playerId: "p5", seatNumber: 5, betCents: 500 },
      ],
    });

    expect(result.events.map((event) => event.cardId)).toEqual(
      expected.map((card) => card.cardId),
    );
    expect(source.nextIndex).toBe(0);
    expect(result.shoe.nextIndex).toBe(8);
  });

  it("marks only the dealer second card as the hidden hole card event", () => {
    const result = dealInitialBlackjackCards({
      roundId: "round-hole",
      shoe: shoe("deal-hole"),
      participants: [{ playerId: "p2", seatNumber: 2, betCents: 100 }],
    });

    const dealerEvents = result.events.filter(
      (event) => event.recipient === "DEALER",
    );

    expect(dealerEvents).toHaveLength(2);
    expect(dealerEvents[0]).toMatchObject({ pass: 1, faceUp: true });
    expect(dealerEvents[1]).toMatchObject({ pass: 2, faceUp: false });
    expect(result.dealer.holeCardRevealed).toBe(false);
  });

  it("builds stable initial hand identities and preserves each seat stake", () => {
    const result = dealInitialBlackjackCards({
      roundId: "round-hands",
      shoe: shoe("deal-hands"),
      participants: [
        { playerId: "p2", seatNumber: 2, betCents: 2_000 },
        { playerId: "p4", seatNumber: 4, betCents: 8_000 },
      ],
    });

    expect(result.hands[0]).toMatchObject({
      handId: "round-hands:seat-2:initial",
      playerId: "p2",
      seatNumber: 2,
      betCents: 2_000,
      origin: "INITIAL",
      splitDepth: 0,
      isDoubled: false,
    });
    expect(result.hands[1]).toMatchObject({
      handId: "round-hands:seat-4:initial",
      playerId: "p4",
      seatNumber: 4,
      betCents: 8_000,
    });
  });

  it("recognizes a natural Blackjack during the second pass", () => {
    const source = shoe("deal-natural");
    const cards = [...source.cards];

    // One player: P1 gets index 0 and 2; dealer gets index 1 and 3.
    const aceIndex = cards.findIndex((card) => card.rank === "A");
    const kingIndex = cards.findIndex(
      (card, index) => index !== aceIndex && card.rank === "K",
    );
    [cards[0], cards[aceIndex]] = [cards[aceIndex], cards[0]];
    [cards[2], cards[kingIndex]] = [cards[kingIndex], cards[2]];

    const rigged: BlackjackShoe = {
      ...source,
      cards,
    };

    const result = dealInitialBlackjackCards({
      roundId: "round-natural",
      shoe: rigged,
      participants: [{ playerId: "p1", seatNumber: 1, betCents: 100 }],
    });

    expect(result.hands[0].cards.map((card) => card.rank)).toEqual(["A", "K"]);
    expect(result.hands[0].status).toBe("BLACKJACK");
  });

  it("rejects duplicate seats, duplicate players, bad stakes and insufficient cards", () => {
    const source = shoe("deal-invalid");

    expect(() =>
      dealInitialBlackjackCards({
        roundId: "round-dup-seat",
        shoe: source,
        participants: [
          { playerId: "p1", seatNumber: 1, betCents: 100 },
          { playerId: "p2", seatNumber: 1, betCents: 100 },
        ],
      }),
    ).toThrow(/duplicate seatNumber/);

    expect(() =>
      dealInitialBlackjackCards({
        roundId: "round-dup-player",
        shoe: source,
        participants: [
          { playerId: "p1", seatNumber: 1, betCents: 100 },
          { playerId: "p1", seatNumber: 2, betCents: 100 },
        ],
      }),
    ).toThrow(/duplicate playerId/);

    expect(() =>
      dealInitialBlackjackCards({
        roundId: "round-bad-bet",
        shoe: source,
        participants: [{ playerId: "p1", seatNumber: 1, betCents: 0 }],
      }),
    ).toThrow(/betCents/);

    const almostEmpty: BlackjackShoe = {
      ...source,
      nextIndex: source.cards.length - 3,
    };
    expect(() =>
      dealInitialBlackjackCards({
        roundId: "round-short",
        shoe: almostEmpty,
        participants: [{ playerId: "p1", seatNumber: 1, betCents: 100 }],
      }),
    ).toThrow(/requires 4 cards/);
  });
});
