import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { RouletteWalletClient } from "./rouletteWalletClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("roulette wallet client", () => {
  it("updates the active global round bet slip", async () => {
    const fetchMock =
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          globalBet: {
            id: "bet-1",
            roundId: "global-round-1",
            bets: [
              {
                betId: "red",
                amount: 10,
              },
            ],
            stakeCents: 1_000,
            payoutCents: 0,
            settlement: null,
            settledAtMs: null,
            updatedAtMs: 123_456,
          },
          balanceCents: 99_000,
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const client =
      new RouletteWalletClient();
    const response =
      await client.updateGlobalBet(
        "global-round-1",
        [
          {
            betId: "red",
            amount: 10,
          },
        ],
        "roulette_global_bet_123",
      );

    expect(
      response.balanceCents,
    ).toBe(99_000);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/roulette/global-bets",
      expect.objectContaining({
        method: "PUT",
        credentials: "same-origin",
      }),
    );

    const options =
      fetchMock.mock.calls[0][1] as RequestInit;
    expect(
      JSON.parse(
        String(options.body),
      ),
    ).toEqual({
      roundId:
        "global-round-1",
      bets: [
        {
          betId: "red",
          amount: 10,
        },
      ],
      idempotencyKey:
        "roulette_global_bet_123",
    });
  });

  it("reads the API simulation version before betting begins", async () => {
    const fetchMock =
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) =>
            name ===
            "X-Roulette-Simulation-Version"
              ? "roulette-full-turn-v2"
              : null,
        },
        json: async () => ({
          simulationVersion:
            "roulette-full-turn-v2",
          serverTimeMs: 123_456,
          globalTable: {
            roundId: "global-round-1",
            simulationVersion:
              "roulette-full-turn-v2",
            phase: "betting",
            serverTimeMs: 123_456,
            bettingOpenAtMs: 120_000,
            bettingCloseAtMs: 140_000,
            spinStartedAtMs: 140_000,
            resultAtMs: 150_000,
            nextRoundAtMs: 152_200,
            seed: null,
            result: null,
          },
          globalBet: null,
          wallet: {
            sessionId: "session-1",
            balanceCents: 100_000,
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const client =
      new RouletteWalletClient();
    const bootstrap =
      await client.bootstrap();

    expect(bootstrap).toEqual({
      simulationVersion:
        "roulette-full-turn-v2",
      serverTimeMs: 123_456,
      globalTable:
        expect.objectContaining({
          roundId:
            "global-round-1",
          bettingCloseAtMs:
            140_000,
        }),
      globalBet: null,
      wallet: {
        sessionId: "session-1",
        balanceCents: 100_000,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/roulette/state",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
  });

  it("sends the exact wager list to the authoritative spin endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        roundId: "round-1",
        seed: "server-seed",
        result: {
          pocketIndex: 0,
          number: 0,
          color: "green",
          finalRelativeAngle: 0,
          finalRadiusRatio: 0.48,
        },
        settlement: {
          winningNumber: 0,
          totalStake: 10,
          winningStake: 0,
          grossReturn: 0,
          netProfit: -10,
          winningBetIds: [],
          lines: [],
        },
        wallet: {
          sessionId: "session-1",
          balanceCents: 99000,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new RouletteWalletClient();
    await client.spin(
      [{ betId: "red", amount: 10 }],
      "roulette_test_key_123",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/roulette/spins",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    );

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({
      bets: [{ betId: "red", amount: 10 }],
      idempotencyKey: "roulette_test_key_123",
    });
  });

  it("falls back to denomination-safe wagers when an older server rejects aggregate amounts", async () => {
    const successBody = {
      roundId: "round-legacy",
      seed: "server-seed",
      result: {
        pocketIndex: 0,
        number: 0,
        color: "green",
        finalRelativeAngle: 0,
        finalRadiusRatio: 0.48,
      },
      settlement: {
        winningNumber: 0,
        totalStake: 20,
        winningStake: 0,
        grossReturn: 0,
        netProfit: -20,
        winningBetIds: [],
        lines: [],
      },
      wallet: {
        sessionId: "session-1",
        balanceCents: 98_000,
      },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: "INVALID_ROULETTE_CHIP",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => successBody,
      });

    vi.stubGlobal("fetch", fetchMock);

    const client =
      new RouletteWalletClient();
    const response =
      await client.spin(
        [
          {
            betId: "straight-17",
            amount: 20,
          },
        ],
        "roulette_legacy_key_123",
      );

    expect(response).toEqual(
      successBody,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const aggregateOptions =
      fetchMock.mock.calls[0][1] as RequestInit;
    expect(
      JSON.parse(
        String(
          aggregateOptions.body,
        ),
      ),
    ).toEqual({
      bets: [
        {
          betId: "straight-17",
          amount: 20,
        },
      ],
      idempotencyKey:
        "roulette_legacy_key_123",
    });

    const fallbackOptions =
      fetchMock.mock.calls[1][1] as RequestInit;
    expect(
      JSON.parse(
        String(
          fallbackOptions.body,
        ),
      ),
    ).toEqual({
      bets: [
        {
          betId: "straight-17",
          amount: 10,
        },
        {
          betId: "straight-17",
          amount: 10,
        },
      ],
      idempotencyKey:
        "roulette_legacy_key_123",
    });
  });
});
