import { describe, expect, it, vi } from "vitest";
import { commitRouletteChipDragMove } from "./chipDragV2";
import type { RouletteWalletClient } from "./rouletteWalletClient";

const bettingTable = {
  roundId: "round-1",
  simulationVersion: "roulette-full-turn-v2",
  phase: "betting" as const,
  serverTimeMs: 1_000,
  bettingOpenAtMs: 0,
  bettingCloseAtMs: 10_000,
  spinStartedAtMs: 11_000,
  resultAtMs: 20_000,
  nextRoundAtMs: 25_000,
  seed: null,
  result: null,
};

const serverBet14 = {
  id: "bet-1",
  roundId: "round-1",
  bets: [{ betId: "straight-14", amount: 10 }],
  stakeCents: 1_000,
  payoutCents: 0,
  revision: 1,
  settlement: null,
  settledAtMs: null,
  updatedAtMs: 1_000,
};

function bootstrap(globalBet: typeof serverBet14 | null) {
  return {
    simulationVersion: "roulette-full-turn-v2",
    serverTimeMs: 1_000,
    globalTable: bettingTable,
    recentResults: [],
    globalBet,
    wallet: {
      sessionId: "session-1",
      balanceCents: 100_000,
    },
  };
}

describe("roulette chip drag source synchronization", () => {
  it("waits for the initial placed bet to reach the server before moving it", async () => {
    const waitForRetry = vi.fn(async () => undefined);
    const updateGlobalBet = vi.fn(async (
      roundId: string,
      bets: readonly { betId: string; amount: number }[],
    ) => ({
      globalBet: {
        ...serverBet14,
        roundId,
        bets: bets.map((bet) => ({ ...bet })),
        revision: 2,
      },
      balanceCents: 100_000,
    }));
    const wallet = {
      bootstrap: vi
        .fn()
        .mockResolvedValueOnce(bootstrap(null))
        .mockResolvedValueOnce(bootstrap(serverBet14)),
      updateGlobalBet,
    } as unknown as Pick<
      RouletteWalletClient,
      "bootstrap" | "updateGlobalBet"
    >;

    await commitRouletteChipDragMove(
      wallet,
      [{ betId: "straight-14", amount: 10 }],
      "straight-14",
      "straight-17",
      waitForRetry,
    );

    expect(wallet.bootstrap).toHaveBeenCalledTimes(2);
    expect(waitForRetry).toHaveBeenCalledTimes(1);
    expect(updateGlobalBet).toHaveBeenCalledTimes(1);
    expect(updateGlobalBet.mock.calls[0]?.[0]).toBe("round-1");
    expect(updateGlobalBet.mock.calls[0]?.[1]).toEqual([
      { betId: "straight-17", amount: 10 },
    ]);
    expect(updateGlobalBet.mock.calls[0]?.[3]).toBe(1);
  });

  it("does not keep retrying once betting has closed", async () => {
    const updateGlobalBet = vi.fn();
    const wallet = {
      bootstrap: vi.fn(async () => ({
        ...bootstrap(null),
        serverTimeMs: 12_000,
        globalTable: {
          ...bettingTable,
          phase: "spinning" as const,
          serverTimeMs: 12_000,
        },
      })),
      updateGlobalBet,
    } as unknown as Pick<
      RouletteWalletClient,
      "bootstrap" | "updateGlobalBet"
    >;

    await expect(
      commitRouletteChipDragMove(
        wallet,
        [{ betId: "straight-14", amount: 10 }],
        "straight-14",
        "straight-17",
        async () => undefined,
      ),
    ).rejects.toThrow("ROULETTE_DRAG_BETTING_CLOSED");

    expect(updateGlobalBet).not.toHaveBeenCalled();
  });
});
