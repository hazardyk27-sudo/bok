import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackHand,
  BlackjackRound,
  BlackjackShoe,
} from "./domain";
import { playBlackjackDealerTurn } from "./dealer";
import { createUnshuffledBlackjackShoe } from "./shoe";

let sequence = 0;

function card(rank: BlackjackCard["rank"]): BlackjackCard {
  sequence += 1;
  return {
    cardId: `dealer-hand-card-${sequence}`,
    deckIndex: 0,
    suit: "HEARTS",
    rank,
  };
}

function hand(
  handId: string,
  status: BlackjackHand["status"] = "STOOD",
): BlackjackHand {
  return {
    handId,
    playerId: "player-1",
    seatNumber: 1,
    cards: [card("10"), card("8")],
    betCents: 1_000,
    status,
    origin: "INITIAL",
    splitDepth: 0,
    isSplitAce: false,
    isDoubled: false,
    result: null,
    payoutCents: 0,
  };
}

function dealerRound(
  dealerRanks: readonly BlackjackCard["rank"][],
  hands: readonly BlackjackHand[] = [hand("h1")],
): BlackjackRound {
  return {
    roundId: "round-dealer",
    roundNumber: 1,
    phase: "DEALER_TURN",
    activeSeatOrder: [1],
    hands,
    dealer: {
      cards: dealerRanks.map(card),
      holeCardRevealed: false,
    },
    currentTurn: null,
    startedAtMs: 0,
    bettingClosesAtMs: 0,
    finishedAtMs: null,
  };
}

function shoeWithNextRanks(
  ranks: readonly BlackjackCard["rank"][],
  shoeId: string,
): BlackjackShoe {
  const source = createUnshuffledBlackjackShoe({
    shoeId,
    createdAtMs: 1,
  });
  const cards = [...source.cards];

  for (let target = 0; target < ranks.length; target += 1) {
    const found = cards.findIndex(
      (candidate, index) => index >= target && candidate.rank === ranks[target],
    );
    [cards[target], cards[found]] = [cards[found], cards[target]];
  }

  return { ...source, cards };
}

describe("blackjack dealer engine", () => {
  it("reveals the hole card and draws until S17 completion", () => {
    const round = dealerRound(["10", "6"]);
    const sourceShoe = shoeWithNextRanks(["5"], "dealer-16");

    const result = playBlackjackDealerTurn(round, sourceShoe);

    expect(result.drawnCards.map((candidate) => candidate.rank)).toEqual(["5"]);
    expect(result.dealerTotal).toBe(21);
    expect(result.dealerBust).toBe(false);
    expect(result.shoe.nextIndex).toBe(sourceShoe.nextIndex + 1);
    expect(sourceShoe.nextIndex).toBe(0);
    expect(result.round.phase).toBe("SETTLEMENT");
    expect(result.round.dealer.holeCardRevealed).toBe(true);
    expect(result.round.dealer.cards.map((candidate) => candidate.rank)).toEqual([
      "10",
      "6",
      "5",
    ]);
  });

  it("stands on soft 17 without consuming a card", () => {
    const round = dealerRound(["A", "6"]);
    const sourceShoe = shoeWithNextRanks(["K"], "dealer-soft17");

    const result = playBlackjackDealerTurn(round, sourceShoe);

    expect(result.dealerTotal).toBe(17);
    expect(result.drawnCards).toHaveLength(0);
    expect(result.shoe.nextIndex).toBe(0);
    expect(result.round.phase).toBe("SETTLEMENT");
  });

  it("draws repeatedly in locked shoe order until reaching 17 or more", () => {
    const round = dealerRound(["10", "2"]);
    const sourceShoe = shoeWithNextRanks(["A", "4"], "dealer-multi-draw");

    const result = playBlackjackDealerTurn(round, sourceShoe);

    expect(result.drawnCards.map((candidate) => candidate.rank)).toEqual([
      "A",
      "4",
    ]);
    expect(result.dealerTotal).toBe(17);
    expect(result.shoe.nextIndex).toBe(2);
  });

  it("marks dealer bust and stops drawing immediately after bust", () => {
    const round = dealerRound(["10", "6"]);
    const sourceShoe = shoeWithNextRanks(["K", "2"], "dealer-bust");

    const result = playBlackjackDealerTurn(round, sourceShoe);

    expect(result.drawnCards.map((candidate) => candidate.rank)).toEqual(["K"]);
    expect(result.dealerTotal).toBe(26);
    expect(result.dealerBust).toBe(true);
    expect(result.shoe.nextIndex).toBe(1);
  });

  it("does not draw unnecessary dealer cards when every player hand already bust", () => {
    const round = dealerRound(["5", "6"], [hand("h1", "BUST")]);
    const sourceShoe = shoeWithNextRanks(["K"], "dealer-all-bust");

    const result = playBlackjackDealerTurn(round, sourceShoe);

    expect(result.drawnCards).toHaveLength(0);
    expect(result.shoe.nextIndex).toBe(0);
    expect(result.dealerTotal).toBe(11);
    expect(result.round.dealer.holeCardRevealed).toBe(true);
    expect(result.round.phase).toBe("SETTLEMENT");
  });

  it("does not draw when dealer already has natural 21", () => {
    const round = dealerRound(["A", "K"]);
    const sourceShoe = shoeWithNextRanks(["5"], "dealer-natural");

    const result = playBlackjackDealerTurn(round, sourceShoe);

    expect(result.drawnCards).toHaveLength(0);
    expect(result.dealerTotal).toBe(21);
    expect(result.shoe.nextIndex).toBe(0);
  });

  it("rejects wrong phase, active player turns and unresolved hands", () => {
    const sourceShoe = shoeWithNextRanks(["5"], "dealer-reject");

    expect(() =>
      playBlackjackDealerTurn(
        { ...dealerRound(["10", "6"]), phase: "PLAYER_TURNS" },
        sourceShoe,
      ),
    ).toThrow(/DEALER_TURN/);

    expect(() =>
      playBlackjackDealerTurn(
        {
          ...dealerRound(["10", "6"]),
          currentTurn: {
            seatNumber: 1,
            handId: "h1",
            startedAtMs: 0,
            endsAtMs: 15_000,
          },
        },
        sourceShoe,
      ),
    ).toThrow(/no active player turn/);

    expect(() =>
      playBlackjackDealerTurn(
        dealerRound(["10", "6"], [hand("h1", "ACTIVE")]),
        sourceShoe,
      ),
    ).toThrow(/unresolved/);

    expect(sourceShoe.nextIndex).toBe(0);
  });
});
