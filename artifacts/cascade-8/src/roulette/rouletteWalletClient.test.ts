import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { RouletteWalletClient } from "./rouletteWalletClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stateResponse(input?: {
  serverTimeMs?: number;
  globalTable?: Record<string, unknown> | null;
}) {
  const serverTimeMs =
    input?.serverTimeMs ??
    100_000;
  const globalTable =
    input && "globalTable" in input
      ? input.globalTable
      : {
          roundId: "global-round-1",
          simulationVersion:
            "roulette-full-turn-v2",
          phase: "betting",
          serverTimeMs,
          bettingOpenAtMs: 90_000,
          bettingCloseAtMs: 120_000,
          spinStartedAtMs: 122_000,
          resultAtMs: 132_000,
          nextRoundAtMs: 135_000,
          seed: null,
          result: null,
        };

  return {
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
      serverTimeMs,
      globalTable,
      recentResults: [7, 26, 0],
      globalBet: null,
      wallet: {
        sessionId: "session-1",
        balanceCents: 100_000,
      },
    }),
  };
}

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
            revision: 1,
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
        0,
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
      expectedRevision: 0,
    });
  });

  it("reads the API simulation version before betting begins", async () => {
    const fetchMock =
      vi.fn().mockResolvedValue(
        stateResponse({
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
        }),
      );

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
      recentResults: [
        7,
        26,
        0,
      ],
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

  it("keeps the active betting round when one state poll returns no table", async () => {
    const fetchMock =
      vi.fn()
        .mockResolvedValueOnce(
          stateResponse({
            serverTimeMs: 100_000,
          }),
        )
        .mockResolvedValueOnce(
          stateResponse({
            serverTimeMs: 105_000,
            globalTable: null,
          }),
        )
        .mockResolvedValueOnce(
          stateResponse({
            serverTimeMs: 120_001,
            globalTable: null,
          }),
        );

    vi.stubGlobal("fetch", fetchMock);

    const client =
      new RouletteWalletClient();

    const first =
      await client.bootstrap();
    const transientGap =
      await client.bootstrap();
    const afterClose =
      await client.bootstrap();

    expect(first.globalTable?.roundId).toBe(
      "global-round-1",
    );
    expect(
      transientGap.globalTable,
    ).toEqual(
      expect.objectContaining({
        roundId: "global-round-1",
        phase: "betting",
        serverTimeMs: 105_000,
      }),
    );
    expect(afterClose.globalTable).toBeNull();
  });

  it("keeps the active betting round across one transient state request failure", async () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(100_000)
      .mockReturnValueOnce(105_000);

    const fetchMock =
      vi.fn()
        .mockResolvedValueOnce(
          stateResponse({
            serverTimeMs: 100_000,
          }),
        )
        .mockRejectedValueOnce(
          new TypeError("network blip"),
        );

    vi.stubGlobal("fetch", fetchMock);

    const client =
      new RouletteWalletClient();

    await client.bootstrap();
    const fallback =
      await client.bootstrap();

    expect(fallback.globalTable).toEqual(
      expect.objectContaining({
        roundId: "global-round-1",
        phase: "betting",
        serverTimeMs: 105_000,
      }),
    );
    expect(fallback.serverTimeMs).toBe(105_000);
  });
});
