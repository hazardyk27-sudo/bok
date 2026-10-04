import { describe, expect, it } from "vitest";
import { buildBlackjackTableViewModelFromSnapshot } from "./snapshotView";

describe("blackjack fractional shared-wallet balance regression", () => {
  it("renders an authenticated cent balance without rejecting the table snapshot", () => {
    const snapshot = {
      serverTimeMs: 1_000,
      tableId: "blackjack-main-table",
      phase: "BETTING" as const,
      maxSeats: 5 as const,
      seats: [1, 2, 3, 4, 5].map((seatNumber) => ({
        seatNumber: seatNumber as 1 | 2 | 3 | 4 | 5,
        playerId: null,
      })),
      players: [],
      round: {
        roundId: "round-1",
        phase: "BETTING" as const,
        hands: [],
        dealer: { cards: [], holeCardRevealed: false },
        currentTurn: null,
        bettingClosesAtMs: 60_000,
      },
      stateVersion: 1,
      eventSequence: 1,
    };

    const model = buildBlackjackTableViewModelFromSnapshot(snapshot, {
      localPlayerId: "blackjack-player:test",
      availableBalanceCents: 12_345,
      transportConnected: true,
    });

    expect(model.balanceLabel).toBe("123.45");
  });
});
