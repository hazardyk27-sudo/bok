import { afterAll, describe, expect, it, vi } from "vitest";
import { installRouletteBetAuthority } from "./betAuthority";
import {
  clearRouletteBetAuthority,
  getRouletteBetAuthoritySnapshot,
} from "./betAuthorityVisual";
import {
  RouletteWalletClient,
  type RouletteGlobalBetUpdateResponse,
} from "./rouletteWalletClient";

const nativeBootstrap = RouletteWalletClient.prototype.bootstrap;
const nativeUpdate = RouletteWalletClient.prototype.updateGlobalBet;

type PendingWrite = {
  expectedRevision: number;
  bets: { betId: string; amount: number }[];
  resolve: (response: RouletteGlobalBetUpdateResponse) => void;
};

const pendingWrites: PendingWrite[] = [];

const bootstrapMock = vi.fn(async () => ({
  simulationVersion: "roulette-full-turn-v2",
  serverTimeMs: 1_000,
  globalTable: {
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
  },
  recentResults: [],
  globalBet: {
    id: "bet-1",
    roundId: "round-1",
    bets: [{ betId: "straight-24", amount: 10 }],
    stakeCents: 1_000,
    payoutCents: 0,
    revision: 1,
    settlement: null,
    settledAtMs: null,
    updatedAtMs: 1_000,
  },
  wallet: {
    sessionId: "session-1",
    balanceCents: 100_000,
  },
}));

const updateMock = vi.fn((
  _roundId: string,
  bets: readonly { betId: string; amount: number }[],
  _idempotencyKey: string,
  expectedRevision: number,
) => new Promise<RouletteGlobalBetUpdateResponse>((resolve) => {
  pendingWrites.push({
    expectedRevision,
    bets: bets.map((bet) => ({ ...bet })),
    resolve,
  });
}));

RouletteWalletClient.prototype.bootstrap = bootstrapMock;
RouletteWalletClient.prototype.updateGlobalBet = updateMock;
installRouletteBetAuthority({} as HTMLDivElement);

afterAll(() => {
  RouletteWalletClient.prototype.bootstrap = nativeBootstrap;
  RouletteWalletClient.prototype.updateGlobalBet = nativeUpdate;
  clearRouletteBetAuthority();
});

describe("roulette serialized authority queue", () => {
  it("keeps a newer local double while an earlier drag write confirms", async () => {
    const client = new RouletteWalletClient();
    await client.bootstrap();

    const first = client.updateGlobalBet(
      "round-1",
      [{ betId: "straight-25", amount: 10 }],
      "roulette_move_v6_first",
      1,
    );
    const second = client.updateGlobalBet(
      "round-1",
      [{ betId: "straight-25", amount: 20 }],
      "roulette_gbet_second",
      1,
    );

    await Promise.resolve();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(pendingWrites).toHaveLength(1);
    expect(getRouletteBetAuthoritySnapshot()).toMatchObject({
      roundId: "round-1",
      bets: [{ betId: "straight-25", amount: 20 }],
      optimistic: true,
    });

    pendingWrites[0]!.resolve({
      globalBet: {
        id: "bet-1",
        roundId: "round-1",
        bets: [{ betId: "straight-25", amount: 10 }],
        stakeCents: 1_000,
        payoutCents: 0,
        revision: 2,
        settlement: null,
        settledAtMs: null,
        updatedAtMs: 2_000,
      },
      balanceCents: 99_000,
    });

    await first;
    await Promise.resolve();

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(pendingWrites).toHaveLength(2);
    expect(pendingWrites[1]!.expectedRevision).toBe(2);
    expect(pendingWrites[1]!.bets).toEqual([
      { betId: "straight-25", amount: 20 },
    ]);
    expect(getRouletteBetAuthoritySnapshot()).toMatchObject({
      bets: [{ betId: "straight-25", amount: 20 }],
      optimistic: true,
    });

    pendingWrites[1]!.resolve({
      globalBet: {
        id: "bet-1",
        roundId: "round-1",
        bets: [{ betId: "straight-25", amount: 20 }],
        stakeCents: 2_000,
        payoutCents: 0,
        revision: 3,
        settlement: null,
        settledAtMs: null,
        updatedAtMs: 3_000,
      },
      balanceCents: 98_000,
    });

    await second;

    expect(getRouletteBetAuthoritySnapshot()).toMatchObject({
      roundId: "round-1",
      bets: [{ betId: "straight-25", amount: 20 }],
      revision: 3,
      optimistic: false,
    });
  });
});
