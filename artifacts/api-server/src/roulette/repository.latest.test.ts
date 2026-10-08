import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBet: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock("./globalBetStore", () => ({
  getRouletteGlobalBetForRound: mocks.getBet,
  settleRouletteGlobalBetForRoundSession: vi.fn(),
  upsertRouletteGlobalBet: mocks.upsert,
}));

vi.mock("./globalTableStore", () => ({
  getCurrentRouletteGlobalTableSnapshot: vi.fn(),
  getRouletteDatabaseNowMs: vi.fn(),
  getRouletteGlobalRecentResults: vi.fn(),
}));

import {
  RouletteRepository,
  areRouletteServerBetTopologiesEqual,
} from "./repository";

beforeEach(() => {
  mocks.getBet.mockReset();
  mocks.upsert.mockReset();
});

describe("roulette latest wager write", () => {
  it("retries a stale predecessor without moving the original server arrival time", async () => {
    mocks.getBet
      .mockResolvedValueOnce({
        globalBet: { revision: 4, stakeCents: 4_000 },
        balanceCents: 100_000,
      })
      .mockResolvedValueOnce({
        globalBet: { revision: 5, stakeCents: 4_000 },
        balanceCents: 99_000,
      });

    mocks.upsert
      .mockRejectedValueOnce(
        new Error("ROULETTE_GLOBAL_BET_STALE"),
      )
      .mockResolvedValueOnce({
        globalBet: {
          revision: 6,
          stakeCents: 8_000,
          bets: [{ betId: "straight-8", amount: 80 }],
        },
        balanceCents: 92_000,
      });

    const repository = new RouletteRepository();
    const result = await repository.updateGlobalBetLatest(
      "session-1",
      {
        roundId: "round-1",
        bets: [{ betId: "straight-8", amount: 80 }],
        idempotencyKey: "roulette_fast_double_1234567890",
        requestReceivedAtMs: 12_345,
      },
    );

    expect(result.globalBet?.revision).toBe(6);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0]![0]).toMatchObject({
      expectedRevision: 4,
      requestReceivedAtMs: 12_345,
    });
    expect(mocks.upsert.mock.calls[1]![0]).toMatchObject({
      expectedRevision: 5,
      requestReceivedAtMs: 12_345,
    });
  });

  it("does not retry non-stale failures", async () => {
    mocks.getBet.mockResolvedValue({
      globalBet: { revision: 2, stakeCents: 4_000 },
      balanceCents: 100_000,
    });
    mocks.upsert.mockRejectedValue(
      new Error("INSUFFICIENT_ROULETTE_CREDITS"),
    );

    const repository = new RouletteRepository();

    await expect(
      repository.updateGlobalBetLatest(
        "session-1",
        {
          roundId: "round-1",
          bets: [{ betId: "straight-8", amount: 80 }],
          idempotencyKey: "roulette_fast_double_abcdefghij",
          requestReceivedAtMs: 12_345,
        },
      ),
    ).rejects.toThrow("INSUFFICIENT_ROULETTE_CREDITS");

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("keeps a newer repeated double when an older smaller fast request arrives late", async () => {
    mocks.getBet.mockResolvedValue({
      globalBet: {
        revision: 7,
        stakeCents: 16_000,
        bets: [{ betId: "straight-8", amount: 160 }],
      },
      balanceCents: 84_000,
    });

    const repository = new RouletteRepository();
    const result = await repository.updateGlobalBetLatest(
      "session-1",
      {
        roundId: "round-1",
        bets: [{ betId: "straight-8", amount: 80 }],
        idempotencyKey: "roulette_fast_double_late_smaller",
        requestReceivedAtMs: 12_345,
      },
    );

    expect(result.globalBet?.stakeCents).toBe(16_000);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("treats equal aggregate topology as already applied even when placement rows are split", () => {
    expect(
      areRouletteServerBetTopologiesEqual(
        [
          { betId: "straight-8", amount: 40 },
          { betId: "straight-8", amount: 40 },
        ],
        [{ betId: "straight-8", amount: 80 }],
      ),
    ).toBe(true);
  });

  it("does not create a new revision for equal stake and equal aggregate topology", async () => {
    const current = {
      globalBet: {
        revision: 7,
        stakeCents: 8_000,
        bets: [
          { betId: "straight-8", amount: 40 },
          { betId: "straight-8", amount: 40 },
        ],
      },
      balanceCents: 92_000,
    };
    mocks.getBet.mockResolvedValue(current);

    const repository = new RouletteRepository();
    const result = await repository.updateGlobalBetLatest(
      "session-1",
      {
        roundId: "round-1",
        bets: [{ betId: "straight-8", amount: 80 }],
        idempotencyKey: "roulette_fast_double_equal_same",
        requestReceivedAtMs: 12_345,
      },
    );

    expect(result).toBe(current);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("applies an equal-stake latest plan when the wager topology changed", async () => {
    mocks.getBet.mockResolvedValue({
      globalBet: {
        revision: 7,
        stakeCents: 8_000,
        bets: [
          { betId: "straight-8", amount: 40 },
          { betId: "red", amount: 40 },
        ],
      },
      balanceCents: 92_000,
    });
    mocks.upsert.mockResolvedValue({
      globalBet: {
        revision: 8,
        stakeCents: 8_000,
        bets: [{ betId: "straight-8", amount: 80 }],
      },
      balanceCents: 92_000,
    });

    const repository = new RouletteRepository();
    const result = await repository.updateGlobalBetLatest(
      "session-1",
      {
        roundId: "round-1",
        bets: [{ betId: "straight-8", amount: 80 }],
        idempotencyKey: "roulette_fast_double_equal_topology",
        requestReceivedAtMs: 12_345,
      },
    );

    expect(result.globalBet?.revision).toBe(8);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0]![0]).toMatchObject({
      expectedRevision: 7,
      bets: [{ betId: "straight-8", amount: 80 }],
    });
  });
});
