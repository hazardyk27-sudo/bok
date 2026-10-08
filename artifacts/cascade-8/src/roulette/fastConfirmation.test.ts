import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  confirmRouletteExternalLatestMutation,
  reserveRouletteExternalLatestMutation,
} from "./betAuthority";
import {
  clearRouletteBetAuthority,
  getRouletteBetAuthoritySnapshot,
  setRouletteBetAuthority,
} from "./betAuthorityVisual";
import type {
  RouletteGlobalBetUpdateResponse,
} from "./rouletteWalletClient";

function response(
  roundId: string,
  betId: string,
  amount: number,
  revision: number,
): RouletteGlobalBetUpdateResponse {
  return {
    globalBet: {
      id: `bet-${roundId}`,
      roundId,
      bets: [{ betId, amount }],
      stakeCents: amount * 100,
      payoutCents: 0,
      revision,
      settlement: null,
      settledAtMs: null,
      updatedAtMs: revision * 1_000,
    },
    balanceCents: 100_000 - amount * 100,
  };
}

afterEach(() => {
  clearRouletteBetAuthority();
});

describe("roulette fast confirmation ownership", () => {
  it("accepts the current fast response and reports that it still owns the UI", () => {
    const plan = [{
      betId: "straight-25",
      amount: 20,
    }];
    setRouletteBetAuthority(
      "round-1",
      plan,
      1,
      true,
    );
    const sequence =
      reserveRouletteExternalLatestMutation();

    expect(
      confirmRouletteExternalLatestMutation(
        "round-1",
        plan,
        response(
          "round-1",
          "straight-25",
          20,
          2,
        ),
        sequence,
      ),
    ).toBe(true);
    expect(
      getRouletteBetAuthoritySnapshot(),
    ).toMatchObject({
      roundId: "round-1",
      revision: 2,
      optimistic: false,
    });
  });

  it("rejects an older fast response after a newer mutation claimed authority", () => {
    const oldPlan = [{
      betId: "straight-25",
      amount: 20,
    }];
    setRouletteBetAuthority(
      "round-1",
      oldPlan,
      1,
      true,
    );
    const oldSequence =
      reserveRouletteExternalLatestMutation();

    reserveRouletteExternalLatestMutation();
    setRouletteBetAuthority(
      "round-1",
      [{
        betId: "straight-25",
        amount: 40,
      }],
      1,
      true,
    );

    expect(
      confirmRouletteExternalLatestMutation(
        "round-1",
        oldPlan,
        response(
          "round-1",
          "straight-25",
          20,
          2,
        ),
        oldSequence,
      ),
    ).toBe(false);
    expect(
      getRouletteBetAuthoritySnapshot(),
    ).toMatchObject({
      bets: [{
        betId: "straight-25",
        amount: 40,
      }],
      optimistic: true,
    });
  });

  it("rejects an old-round fast response after round rollover", () => {
    const oldPlan = [{
      betId: "straight-25",
      amount: 20,
    }];
    const sequence =
      reserveRouletteExternalLatestMutation();

    setRouletteBetAuthority(
      "round-2",
      [],
      0,
      false,
    );

    expect(
      confirmRouletteExternalLatestMutation(
        "round-1",
        oldPlan,
        response(
          "round-1",
          "straight-25",
          20,
          2,
        ),
        sequence,
      ),
    ).toBe(false);
    expect(
      getRouletteBetAuthoritySnapshot().roundId,
    ).toBe("round-2");
  });
});
