import { describe, expect, it, vi } from "vitest";
import {
  ROULETTE_DRAG_SOURCE_SYNC_MAX_ATTEMPTS,
  commitRouletteSequentialChipMove,
  getRouletteDragSourceRetryMs,
} from "./chipDragV6";
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

function snapshot(betId: string, revision: number) {
  return {
    id: "bet-1",
    roundId: "round-1",
    bets: [{ betId, amount: 10 }],
    stakeCents: 1_000,
    payoutCents: 0,
    revision,
    settlement: null,
    settledAtMs: null,
    updatedAtMs: 1_000,
  };
}

function bootstrap(globalBet: ReturnType<typeof snapshot> | null) {
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

describe("roulette sequential chip drag v6", () => {
  it("moves the same chip repeatedly across consecutive cells", async () => {
    let serverBet = snapshot("straight-14", 1);
    const bootstrapMock = vi.fn(async () => bootstrap(serverBet));
    const updateGlobalBet = vi.fn(async (
      roundId: string,
      bets: readonly { betId: string; amount: number }[],
      idempotencyKey: string,
      expectedRevision: number,
    ) => {
      expect(roundId).toBe("round-1");
      expect(expectedRevision).toBe(serverBet.revision);
      expect(idempotencyKey.startsWith("roulette_move_v6_")).toBe(true);
      expect(idempotencyKey.startsWith("roulette_drag_")).toBe(false);
      serverBet = {
        ...serverBet,
        bets: bets.map((bet) => ({ ...bet })),
        revision: serverBet.revision + 1,
      };
      return {
        globalBet: serverBet,
        balanceCents: 100_000,
      };
    });
    const wallet = {
      bootstrap: bootstrapMock,
      updateGlobalBet,
    } as unknown as Pick<
      RouletteWalletClient,
      "bootstrap" | "updateGlobalBet"
    >;

    await commitRouletteSequentialChipMove(
      wallet,
      [{ betId: "straight-14", amount: 10 }],
      "straight-14",
      "straight-17",
    );
    await commitRouletteSequentialChipMove(
      wallet,
      [{ betId: "straight-17", amount: 10 }],
      "straight-17",
      "straight-20",
    );
    await commitRouletteSequentialChipMove(
      wallet,
      [{ betId: "straight-20", amount: 10 }],
      "straight-20",
      "straight-23",
    );

    expect(updateGlobalBet).toHaveBeenCalledTimes(3);
    expect(updateGlobalBet.mock.calls[0]?.[1]).toEqual([
      { betId: "straight-17", amount: 10 },
    ]);
    expect(updateGlobalBet.mock.calls[1]?.[1]).toEqual([
      { betId: "straight-20", amount: 10 },
    ]);
    expect(updateGlobalBet.mock.calls[2]?.[1]).toEqual([
      { betId: "straight-23", amount: 10 },
    ]);
    expect(serverBet.revision).toBe(4);
    expect(serverBet.bets).toEqual([
      { betId: "straight-23", amount: 10 },
    ]);
  });

  it("waits for the initial placed bet before the first move", async () => {
    const waitForRetry = vi.fn(async () => undefined);
    const serverBet = snapshot("straight-14", 1);
    const updateGlobalBet = vi.fn(async (
      roundId: string,
      bets: readonly { betId: string; amount: number }[],
    ) => ({
      globalBet: {
        ...serverBet,
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
        .mockResolvedValueOnce(bootstrap(serverBet)),
      updateGlobalBet,
    } as unknown as Pick<
      RouletteWalletClient,
      "bootstrap" | "updateGlobalBet"
    >;

    await commitRouletteSequentialChipMove(
      wallet,
      [{ betId: "straight-14", amount: 10 }],
      "straight-14",
      "straight-17",
      waitForRetry,
    );

    expect(waitForRetry).toHaveBeenCalledTimes(1);
    expect(waitForRetry).toHaveBeenCalledWith(0);
    expect(updateGlobalBet).toHaveBeenCalledTimes(1);
    expect(updateGlobalBet.mock.calls[0]?.[1]).toEqual([
      { betId: "straight-17", amount: 10 },
    ]);
  });

  it("uses a short capped backoff instead of the legacy 100 x 50ms polling loop", () => {
    const waits = Array.from(
      { length: ROULETTE_DRAG_SOURCE_SYNC_MAX_ATTEMPTS - 1 },
      (_, index) => getRouletteDragSourceRetryMs(index),
    );

    expect(ROULETTE_DRAG_SOURCE_SYNC_MAX_ATTEMPTS).toBe(10);
    expect(waits[0]).toBe(50);
    expect(Math.max(...waits)).toBeLessThanOrEqual(250);
    expect(waits.reduce((sum, wait) => sum + wait, 0)).toBeLessThan(1_800);
  });

  it("stops polling after the bounded source-sync budget", async () => {
    const waitForRetry = vi.fn(async () => undefined);
    const bootstrapMock = vi.fn(async () => bootstrap(null));
    const updateGlobalBet = vi.fn();
    const wallet = {
      bootstrap: bootstrapMock,
      updateGlobalBet,
    } as unknown as Pick<
      RouletteWalletClient,
      "bootstrap" | "updateGlobalBet"
    >;

    await expect(
      commitRouletteSequentialChipMove(
        wallet,
        [{ betId: "straight-14", amount: 10 }],
        "straight-14",
        "straight-17",
        waitForRetry,
      ),
    ).rejects.toThrow("ROULETTE_DRAG_BET_UNAVAILABLE");

    expect(bootstrapMock).toHaveBeenCalledTimes(
      ROULETTE_DRAG_SOURCE_SYNC_MAX_ATTEMPTS,
    );
    expect(waitForRetry).toHaveBeenCalledTimes(
      ROULETTE_DRAG_SOURCE_SYNC_MAX_ATTEMPTS - 1,
    );
    expect(updateGlobalBet).not.toHaveBeenCalled();
  });
});
