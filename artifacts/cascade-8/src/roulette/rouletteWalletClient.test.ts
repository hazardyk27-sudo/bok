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
});
