import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackRound,
  BlackjackShoe,
  BlackjackTable,
} from "./domain";
import {
  BlackjackPlayerActionCoordinator,
  type BlackjackCoordinatedPlayerAction,
} from "./actionCoordinator";
import { BlackjackStaleActionError } from "./actionProtocol";
import { createBlackjackReservationBook } from "./reservations";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function shoeWithOpeningPair(): BlackjackShoe {
  const source = createUnshuffledBlackjackShoe({
    shoeId: "race-shoe",
    createdAtMs: 1,
  });
  const cards = [...source.cards];

  function moveRank(rank: BlackjackCard["rank"], target: number) {
    const index = cards.findIndex(
      (card, candidateIndex) =>
        candidateIndex >= target && card.rank === rank,
    );
    if (index < 0) throw new Error("rank missing");
    [cards[target], cards[index]] = [cards[index], cards[target]];
  }

  moveRank("5", 0);
  moveRank("5", 1);
  moveRank("10", 2);
  moveRank("7", 3);
  moveRank("6", 4);
  moveRank("8", 5);

  return {
    ...source,
    cards,
    nextIndex: 4,
  };
}

function raceTable(): BlackjackTable {
  const shoe = shoeWithOpeningPair();
  const foundation = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe,
  });

  const round: BlackjackRound = {
    roundId: "race-round",
    roundNumber: 1,
    phase: "PLAYER_TURNS",
    activeSeatOrder: [1],
    hands: [
      {
        handId: "race-hand",
        playerId: "player-1",
        seatNumber: 1,
        cards: [shoe.cards[0], shoe.cards[1]],
        betCents: 1_000,
        status: "ACTIVE",
        origin: "INITIAL",
        splitDepth: 0,
        isSplitAce: false,
        isDoubled: false,
        result: null,
        payoutCents: 0,
      },
    ],
    dealer: {
      cards: [shoe.cards[2], shoe.cards[3]],
      holeCardRevealed: false,
    },
    currentTurn: {
      seatNumber: 1,
      handId: "race-hand",
      startedAtMs: 0,
      endsAtMs: 15_000,
    },
    startedAtMs: 0,
    bettingClosesAtMs: 0,
    finishedAtMs: null,
  };

  return {
    ...foundation,
    phase: "PLAYER_TURNS",
    seats: foundation.seats.map((seat) => ({
      ...seat,
      playerId: "player-" + seat.seatNumber,
    })),
    players: foundation.seats.map((seat) => ({
      playerId: "player-" + seat.seatNumber,
      userId: "user-" + seat.seatNumber,
      sessionId: "session-" + seat.seatNumber,
      seatNumber: seat.seatNumber,
      status: "PLAYING" as const,
      connected: true,
      disconnectedAtMs: null,
      handIds: seat.seatNumber === 1 ? ["race-hand"] : [],
    })),
    round,
  };
}

function accounts() {
  return Array.from({ length: 5 }, (_, index) => {
    const number = index + 1;
    return {
      playerId: "player-" + number,
      userId: "user-" + number,
      wallet: createBlackjackWalletLedgerState({
        userId: "user-" + number,
        totalBalanceCents: 100_000,
      }),
      book: createBlackjackReservationBook("user-" + number),
    };
  });
}

function action(
  type: "HIT" | "STAND" | "DOUBLE" | "SPLIT",
  actionId: string,
  expectedStateVersion = 0,
): BlackjackCoordinatedPlayerAction {
  return {
    envelope: {
      actionId,
      actorPlayerId: "player-1",
      type,
      tableId: "main-blackjack",
      expectedStateVersion,
      roundId: "race-round",
      handId: "race-hand",
      seatNumber: 1,
      payloadFingerprint: type + ":" + actionId,
    },
    nowMs: 1_000,
    ...(type === "DOUBLE" || type === "SPLIT"
      ? {
          reservationId: "reservation-" + actionId,
          reserveTransactionId: "reserve-" + actionId,
        }
      : {}),
  };
}

describe("blackjack concurrent player-action coordinator", () => {
  it("serializes simultaneous HIT/STAND/DOUBLE/SPLIT so only FIFO winner mutates state", async () => {
    const coordinator = new BlackjackPlayerActionCoordinator({
      table: raceTable(),
      accounts: accounts(),
    });
    const beforeShoeIndex = coordinator.getTable().shoe.nextIndex;

    const outcomes = await Promise.allSettled([
      coordinator.submit(action("SPLIT", "race-split")),
      coordinator.submit(action("DOUBLE", "race-double")),
      coordinator.submit(action("HIT", "race-hit")),
      coordinator.submit(action("STAND", "race-stand")),
    ]);

    expect(outcomes[0].status).toBe("fulfilled");
    expect(outcomes.slice(1).every((item) => item.status === "rejected")).toBe(
      true,
    );

    for (const outcome of outcomes.slice(1)) {
      if (outcome.status === "rejected") {
        expect(outcome.reason).toBeInstanceOf(BlackjackStaleActionError);
      }
    }

    const table = coordinator.getTable();
    expect(table.stateVersion).toBe(1);
    expect(table.eventSequence).toBe(1);
    expect(table.shoe.nextIndex).toBe(beforeShoeIndex + 2);
    expect(table.round?.hands).toHaveLength(2);
    expect(table.round?.hands[0].origin).toBe("SPLIT");
    expect(coordinator.getProtocol().receipts).toHaveLength(1);

    const account = coordinator.getAccount("player-1");
    expect(account.wallet.availableBalanceCents).toBe(99_000);
    expect(account.wallet.reservedBalanceCents).toBe(1_000);
    expect(account.book.reservations).toHaveLength(1);
  });

  it("executes an identical retry burst only once even under 100 concurrent submissions", async () => {
    const coordinator = new BlackjackPlayerActionCoordinator({
      table: raceTable(),
      accounts: accounts(),
    });
    const retryAction = action("HIT", "retry-hit");
    const beforeShoeIndex = coordinator.getTable().shoe.nextIndex;

    const outcomes = await Promise.all(
      Array.from({ length: 100 }, () =>
        coordinator.submit(retryAction),
      ),
    );

    expect(outcomes).toHaveLength(100);
    expect(outcomes[0].replayed).toBe(false);
    expect(outcomes.slice(1).every((result) => result.replayed)).toBe(true);
    expect(coordinator.getTable().stateVersion).toBe(1);
    expect(coordinator.getTable().eventSequence).toBe(1);
    expect(coordinator.getTable().shoe.nextIndex).toBe(beforeShoeIndex + 1);
    expect(coordinator.getProtocol().receipts).toHaveLength(1);
    expect(coordinator.pendingCount()).toBe(0);
    expect(coordinator.activeCount()).toBe(0);
  });

  it("survives 250 independent four-way races without double card consumption", async () => {
    const firstActions = ["HIT", "STAND", "DOUBLE", "SPLIT"] as const;

    for (let iteration = 0; iteration < 250; iteration += 1) {
      const coordinator = new BlackjackPlayerActionCoordinator({
        table: raceTable(),
        accounts: accounts(),
      });
      const first = firstActions[iteration % firstActions.length];
      const rest = firstActions.filter((candidate) => candidate !== first);
      const order = [first, ...rest];
      const beforeShoeIndex = coordinator.getTable().shoe.nextIndex;

      const outcomes = await Promise.allSettled(
        order.map((type, index) =>
          coordinator.submit(
            action(type, "stress-" + iteration + "-" + index),
          ),
        ),
      );

      expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(
        1,
      );
      expect(coordinator.getTable().stateVersion).toBe(1);
      expect(coordinator.getTable().eventSequence).toBe(1);
      expect(coordinator.getProtocol().receipts).toHaveLength(1);

      const expectedDraws =
        first === "STAND" ? 0 : first === "SPLIT" ? 2 : 1;
      expect(coordinator.getTable().shoe.nextIndex).toBe(
        beforeShoeIndex + expectedDraws,
      );

      const account = coordinator.getAccount("player-1");
      const expectedReserve =
        first === "DOUBLE" || first === "SPLIT" ? 1_000 : 0;
      expect(account.wallet.reservedBalanceCents).toBe(expectedReserve);
      expect(account.book.reservations).toHaveLength(
        expectedReserve === 0 ? 0 : 1,
      );
    }
  });

  it("rejects out-of-turn foreign actors without letting them win the queue race", async () => {
    const coordinator = new BlackjackPlayerActionCoordinator({
      table: raceTable(),
      accounts: accounts(),
    });

    const foreign: BlackjackCoordinatedPlayerAction = {
      ...action("HIT", "foreign-hit"),
      envelope: {
        ...action("HIT", "foreign-hit").envelope,
        actorPlayerId: "player-2",
        seatNumber: 2,
        payloadFingerprint: "foreign",
      },
    };

    const foreignOutcome = coordinator.submit(foreign);
    const validOutcome = coordinator.submit(action("STAND", "valid-stand"));

    await expect(foreignOutcome).rejects.toThrow(/does not own the target hand/);
    await expect(validOutcome).resolves.toMatchObject({
      replayed: false,
      queueSequence: 2,
    });

    expect(coordinator.getTable().stateVersion).toBe(1);
    expect(coordinator.getTable().round?.hands[0].status).toBe("STOOD");
    expect(coordinator.getProtocol().receipts).toHaveLength(1);
  });
});
