import { describe, expect, it, vi } from "vitest";
import {
  areRouletteBetPlacementsEqual,
  createRouletteVirtualBet,
  rebaseRouletteMutationOntoVirtualState,
  selectRouletteDragBetsWithStakeGuard,
  syncRouletteLatestVisibleState,
  writeRouletteMutationWithRevisionRetry,
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

  it("keeps the full wager when a VERIFY render exposes only a partial DOM bet set", () => {
    const fullWager = Array.from({ length: 10 }, (_, index) => ({
      betId: `straight-${index + 1}`,
      amount: 100,
    }));
    const partialDom = fullWager.slice(0, 7);

    expect(
      selectRouletteDragBetsWithStakeGuard(partialDom, fullWager),
    ).toEqual(fullWager);
  });

  it("accepts a complete moved DOM state when total drag stake is unchanged", () => {
    const fallback = [
      { betId: "straight-8", amount: 500 },
      { betId: "straight-17", amount: 500 },
    ];
    const moved = [
      { betId: "high", amount: 500 },
      { betId: "straight-17", amount: 500 },
    ];

    expect(
      selectRouletteDragBetsWithStakeGuard(moved, fallback),
    ).toEqual(moved);
  });

  it("refuses to write a partial DOM snapshot that would shrink drag stake", async () => {
    const fullWager = Array.from({ length: 10 }, (_, index) => ({
      betId: `straight-${index + 1}`,
      amount: 100,
    }));
    const actual: RouletteGlobalBetSnapshot = {
      ...snapshot("straight-1", 8),
      bets: fullWager,
      stakeCents: 100_000,
      revision: 8,
    };
    const writeActual = vi.fn<(
      bets: readonly { betId: string; amount: number }[],
      expectedRevision: number,
    ) => Promise<RouletteGlobalBetUpdateResponse>>();

    await expect(
      syncRouletteLatestVisibleState({
        roundId: "round-1",
        initialActual: {
          globalBet: actual,
          balanceCents: 900_000,
        },
        readLatestBets: () =>
          Array.from({ length: 7 }, (_, index) => ({
            betId: `straight-${index + 1}`,
            amount: 10,
          })),
        refreshActual: vi.fn(async () => ({
          globalBet: actual,
          balanceCents: 900_000,
        })),
        writeActual,
      }),
    ).rejects.toThrow("ROULETTE_DRAG_STAKE_MISMATCH");

    expect(writeActual).not.toHaveBeenCalled();
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

  it("uses the drag writer actual revision instead of a stale runtime revision", async () => {
    const bets = [{ betId: "high", amount: 20 }];
    const writeActual = vi.fn(async (
      nextBets: readonly { betId: string; amount: number }[],
      expectedRevision: number,
    ): Promise<RouletteGlobalBetUpdateResponse> => ({
      globalBet: {
        ...snapshot("high", expectedRevision + 1),
        bets: nextBets.map((bet) => ({ ...bet })),
        stakeCents: 2_000,
        revision: expectedRevision + 1,
      },
      balanceCents: 98_000,
    }));
    const refreshActual = vi.fn(async () => ({
      globalBet: snapshot("high", 2),
      balanceCents: 99_000,
    }));

    const result = await writeRouletteMutationWithRevisionRetry({
      roundId: "round-1",
      bets,
      expectedRevision: 1,
      knownActualRevision: 2,
      refreshActual,
      writeActual,
    });

    expect(writeActual).toHaveBeenCalledTimes(1);
    expect(writeActual.mock.calls[0]?.[0]).toEqual(bets);
    expect(writeActual.mock.calls[0]?.[1]).toBe(2);
    expect(refreshActual).not.toHaveBeenCalled();
    expect(result.globalBet?.bets).toEqual(bets);
    expect(result.globalBet?.revision).toBe(3);
  });

  it("refreshes and retries the same final x2 state when revision races again", async () => {
    const bets = [{ betId: "high", amount: 40 }];
    const writeActual = vi
      .fn<(
        nextBets: readonly { betId: string; amount: number }[],
        expectedRevision: number,
      ) => Promise<RouletteGlobalBetUpdateResponse>>()
      .mockRejectedValueOnce(new Error("ROULETTE_GLOBAL_BET_STALE"))
      .mockImplementationOnce(async (nextBets, expectedRevision) => ({
        globalBet: {
          ...snapshot("high", expectedRevision + 1),
          bets: nextBets.map((bet) => ({ ...bet })),
          stakeCents: 4_000,
          revision: expectedRevision + 1,
        },
        balanceCents: 96_000,
      }));
    const refreshActual = vi.fn(async () => ({
      globalBet: {
        ...snapshot("high", 3),
        bets: [{ betId: "high", amount: 20 }],
        stakeCents: 2_000,
        revision: 3,
      },
      balanceCents: 98_000,
    }));

    const result = await writeRouletteMutationWithRevisionRetry({
      roundId: "round-1",
      bets,
      expectedRevision: 1,
      knownActualRevision: 2,
      refreshActual,
      writeActual,
    });

    expect(writeActual).toHaveBeenCalledTimes(2);
    expect(writeActual.mock.calls[0]?.[1]).toBe(2);
    expect(writeActual.mock.calls[1]?.[0]).toEqual(bets);
    expect(writeActual.mock.calls[1]?.[1]).toBe(3);
    expect(refreshActual).toHaveBeenCalledTimes(1);
    expect(result.globalBet?.bets).toEqual(bets);
    expect(result.globalBet?.revision).toBe(4);
  });
});
