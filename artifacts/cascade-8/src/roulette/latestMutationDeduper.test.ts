import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  clearRouletteExternalLatestMutationForTests,
  consumeMatchingRouletteExternalLatestMutation,
  registerRouletteExternalLatestMutation,
} from "./latestMutationDeduper";
import type {
  RouletteGlobalBetUpdateResponse,
} from "./rouletteWalletClient";

afterEach(() => {
  clearRouletteExternalLatestMutationForTests();
});

function response(
  amount: number,
): RouletteGlobalBetUpdateResponse {
  return {
    globalBet: {
      id: "bet-1",
      roundId: "round-1",
      bets: [{
        betId: "straight-25",
        amount,
      }],
      stakeCents: amount * 100,
      payoutCents: 0,
      revision: 2,
      settlement: null,
      settledAtMs: null,
      updatedAtMs: 2_000,
    },
    balanceCents: 100_000 - amount * 100,
  };
}

describe("roulette latest mutation deduper", () => {
  it("reuses one in-flight latest request for the matching runtime plan", async () => {
    const shared = Promise.resolve(
      response(20),
    );

    registerRouletteExternalLatestMutation(
      "round-1",
      [
        {
          betId: "straight-25",
          amount: 10,
        },
        {
          betId: "straight-25",
          amount: 10,
        },
      ],
      shared,
    );

    const consumed =
      consumeMatchingRouletteExternalLatestMutation(
        "round-1",
        [{
          betId: "straight-25",
          amount: 20,
        }],
      );

    expect(consumed).toBe(shared);
    await expect(consumed).resolves.toEqual(
      response(20),
    );

    expect(
      consumeMatchingRouletteExternalLatestMutation(
        "round-1",
        [{
          betId: "straight-25",
          amount: 20,
        }],
      ),
    ).toBeNull();
  });

  it("does not consume a latest request for a different round or wager topology", () => {
    const shared = Promise.resolve(
      response(20),
    );

    registerRouletteExternalLatestMutation(
      "round-1",
      [{
        betId: "straight-25",
        amount: 20,
      }],
      shared,
    );

    expect(
      consumeMatchingRouletteExternalLatestMutation(
        "round-2",
        [{
          betId: "straight-25",
          amount: 20,
        }],
      ),
    ).toBeNull();
    expect(
      consumeMatchingRouletteExternalLatestMutation(
        "round-1",
        [{
          betId: "straight-26",
          amount: 20,
        }],
      ),
    ).toBeNull();
    expect(
      consumeMatchingRouletteExternalLatestMutation(
        "round-1",
        [{
          betId: "straight-25",
          amount: 20,
        }],
      ),
    ).toBe(shared);
  });
});
