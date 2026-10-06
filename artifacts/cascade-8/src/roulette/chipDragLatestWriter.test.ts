import { describe, expect, it, vi } from "vitest";
import {
  areRouletteBetPlacementsEqual,
  createRouletteVirtualBet,
  rebaseRouletteMutationOntoVirtualState,
  syncRouletteLatestVisibleState,
} from "./chipDragLatestWriter";
import type {
  RouletteGlobalBetSnapshot,
  RouletteGlobalBetUpdateResponse,
} from "./rouletteWalletClient";

function snapshot(
  betId: string,
  revision: number,
): RouletteGlobalBetSnapshot {
  return {
    id: "bet-1",
    roundId: "round-1",
    bets: [{ betId, amount: 10 }],
    stakeCents: 1_000,
    payoutCents: 0,
    revision,
    settlement: null,
    settledAtMs: null,
    updatedAtMs: 1_000 + revision,
  };
}

describe("roulette latest dragged position writer", () => {
  it("keeps chasing the newest visible position while an older write is in flight", async () => {
    let latestBetId = "straight-5";
    let actual = snapshot("straight-8", 1);

    const writeActual = vi.fn(async (
      bets: readonly { betId: string; amount: number }[],
      expectedRevision: number,
    ): Promise<RouletteGlobalBetUpdateResponse> => {
      expect(expectedRevision).toBe(actual.revision);
      actual = {
        ...actual,
        bets: bets.map((bet) => ({ ...bet })),
        revision: actual.revision + 1,
      };

      if (writeActual.mock.calls.length === 1) {
        latestBetId = "straight-11";
      }

      return {
        globalBet: actual,
        balanceCents: 100_000,
      };
    });

    const result = await syncRouletteLatestVisibleState({
      roundId: "round-1",
      initialActual: {
        globalBet: actual,
        balanceCents: 100_000,
      },
      readLatestBets: () => [{ betId: latestBetId, amount: 10 }],
      refreshActual: vi.fn(async () => ({
        globalBet: actual,
        balanceCents: 100_000,
      })),
      writeActual,
    });

    expect(writeActual).toHaveBeenCalledTimes(2);
    expect(writeActual.mock.calls[0]?.[0]).toEqual([
      { betId: "straight-5", amount: 10 },
    ]);
    expect(writeActual.mock.calls[1]?.[0]).toEqual([
      { betId: "straight-11", amount: 10 },
    ]);
    expect(result.globalBet?.bets).toEqual([
      { betId: "straight-11", amount: 10 },
    ]);
    expect(result.globalBet?.revision).toBe(3);
  });

  it("lets the V6 command queue advance virtually without changing the final desired stake", () => {
    const move1 = createRouletteVirtualBet(
      snapshot("straight-8", 1),
      [{ betId: "straight-5", amount: 10 }],
      1,
    );
    const move2 = createRouletteVirtualBet(
      move1,
      [{ betId: "straight-2", amount: 10 }],
      move1.revision,
    );
    const move3 = createRouletteVirtualBet(
      move2,
      [{ betId: "straight-11", amount: 10 }],
      move2.revision,
    );

    expect(move1.revision).toBe(2);
    expect(move2.revision).toBe(3);
    expect(move3.revision).toBe(4);
    expect(move3.stakeCents).toBe(1_000);
    expect(move3.bets).toEqual([
      { betId: "straight-11", amount: 10 },
    ]);
    expect(
      areRouletteBetPlacementsEqual(
        move3.bets,
        [{ betId: "straight-11", amount: 10 }],
      ),
    ).toBe(true);
  });

  it("rebases x2 from the stale pre-drag cell onto the final dragged cell", () => {
    const rebased = rebaseRouletteMutationOntoVirtualState(
      [{ betId: "straight-8", amount: 10 }],
      [{ betId: "high", amount: 10 }],
      [{ betId: "straight-8", amount: 20 }],
    );

    expect(rebased).toEqual([
      { betId: "high", amount: 20 },
    ]);
  });

  it("keeps repeated x2 mutations on the final dragged cell", () => {
    const first = rebaseRouletteMutationOntoVirtualState(
      [{ betId: "straight-8", amount: 10 }],
      [{ betId: "high", amount: 10 }],
      [{ betId: "straight-8", amount: 20 }],
    );
    const second = rebaseRouletteMutationOntoVirtualState(
      [{ betId: "straight-8", amount: 20 }],
      first,
      [{ betId: "straight-8", amount: 40 }],
    );

    expect(first).toEqual([
      { betId: "high", amount: 20 },
    ]);
    expect(second).toEqual([
      { betId: "high", amount: 40 },
    ]);
  });

  it("does not rewrite a mutation that already targets the dragged cell", () => {
    const incoming = [{ betId: "high", amount: 20 }];
    const rebased = rebaseRouletteMutationOntoVirtualState(
      [{ betId: "straight-8", amount: 10 }],
      [{ betId: "high", amount: 10 }],
      incoming,
    );

    expect(rebased).toEqual(incoming);
  });
});