import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  clearRouletteExternalLatestMutationForTests,
  consumeMatchingRouletteExternalLatestMutation,
  hasRouletteActiveExternalLatestMutation,
  registerRouletteExternalLatestMutation,
  releaseRouletteFailedExternalLatestMutation,
} from "./latestMutationDeduper";
import {
  clearRouletteBetAuthority,
  getRouletteBetAuthoritySnapshot,
  setRouletteBetAuthority,
} from "./betAuthorityVisual";
import type {
  RouletteGlobalBetUpdateResponse,
} from "./rouletteWalletClient";

afterEach(() => {
  clearRouletteExternalLatestMutationForTests();
  clearRouletteBetAuthority();
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

  it("tracks a consumed fast request as active until the network promise settles", async () => {
    let resolveShared!: (
      value: RouletteGlobalBetUpdateResponse,
    ) => void;
    const shared = new Promise<RouletteGlobalBetUpdateResponse>(
      (resolve) => {
        resolveShared = resolve;
      },
    );
    const plan = [
      { betId: "straight-25", amount: 10 },
      { betId: "straight-25", amount: 10 },
    ];

    registerRouletteExternalLatestMutation(
      "round-1",
      plan,
      shared,
    );

    expect(
      hasRouletteActiveExternalLatestMutation(
        "round-1",
        [{ betId: "straight-25", amount: 20 }],
      ),
    ).toBe(true);

    expect(
      consumeMatchingRouletteExternalLatestMutation(
        "round-1",
        [{ betId: "straight-25", amount: 20 }],
      ),
    ).toBe(shared);

    expect(
      hasRouletteActiveExternalLatestMutation(
        "round-1",
        [{ betId: "straight-25", amount: 20 }],
      ),
    ).toBe(true);

    resolveShared(response(20));
    await shared;
    await Promise.resolve();

    expect(
      hasRouletteActiveExternalLatestMutation(
        "round-1",
        [{ betId: "straight-25", amount: 20 }],
      ),
    ).toBe(false);
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

  it("releases optimistic authority when the matching fast request fails", () => {
    setRouletteBetAuthority(
      "round-1",
      [{
        betId: "straight-25",
        amount: 20,
      }],
      7,
      true,
    );

    expect(
      releaseRouletteFailedExternalLatestMutation(
        "round-1",
        [{
          betId: "straight-25",
          amount: 20,
        }],
      ),
    ).toBe(true);
    expect(
      getRouletteBetAuthoritySnapshot(),
    ).toEqual({
      roundId: "round-1",
      bets: [{
        betId: "straight-25",
        amount: 20,
      }],
      revision: 7,
      optimistic: false,
    });
  });

  it("does not release a newer different optimistic mutation after an older fast failure", () => {
    setRouletteBetAuthority(
      "round-1",
      [{
        betId: "straight-26",
        amount: 30,
      }],
      7,
      true,
    );

    expect(
      releaseRouletteFailedExternalLatestMutation(
        "round-1",
        [{
          betId: "straight-25",
          amount: 20,
        }],
      ),
    ).toBe(false);
    expect(
      getRouletteBetAuthoritySnapshot(),
    ).toMatchObject({
      roundId: "round-1",
      bets: [{
        betId: "straight-26",
        amount: 30,
      }],
      optimistic: true,
    });
  });
});
