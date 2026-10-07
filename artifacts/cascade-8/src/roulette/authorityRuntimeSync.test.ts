import { afterEach, describe, expect, it } from "vitest";
import {
  selectRouletteRuntimeBootstrapBet,
  shouldAcceptRouletteAuthorityBootstrap,
} from "./betAuthority";
import {
  clearRouletteAuthoritativeDragPlacements,
  clearRouletteBets,
  createRouletteBetState,
  doubleRouletteBets,
  getRouletteBetTotals,
  placeRouletteBet,
  setRouletteAuthoritativeDragPlacements,
  undoRouletteBet,
} from "./betState";
import type { RouletteGlobalBetSnapshot } from "./rouletteWalletClient";

afterEach(() => {
  clearRouletteAuthoritativeDragPlacements();
});

function globalBet(
  revision: number,
  betId: string,
  amount: number,
): RouletteGlobalBetSnapshot {
  return {
    id: "bet-1",
    roundId: "round-1",
    bets: [{ betId, amount }],
    stakeCents: amount * 100,
    payoutCents: 0,
    revision,
    settlement: null,
    settledAtMs: null,
    updatedAtMs: revision,
  };
}

describe("roulette runtime authority synchronization", () => {
  it("uses the moved authoritative topology for a fresh bet and repeated doubles", () => {
    let state = createRouletteBetState();
    state = placeRouletteBet(state, "straight-24");

    setRouletteAuthoritativeDragPlacements([
      { betId: "straight-25", amount: 10 },
    ]);

    state = placeRouletteBet(state, "straight-24");
    expect(getRouletteBetTotals(state.placements)).toEqual({
      "straight-25": 10,
      "straight-24": 10,
    });

    setRouletteAuthoritativeDragPlacements(state.placements);
    state = doubleRouletteBets(state);
    expect(getRouletteBetTotals(state.placements)).toEqual({
      "straight-25": 20,
      "straight-24": 20,
    });

    setRouletteAuthoritativeDragPlacements(state.placements);
    state = doubleRouletteBets(state);
    expect(getRouletteBetTotals(state.placements)).toEqual({
      "straight-25": 40,
      "straight-24": 40,
    });
  });

  it("undoes and clears the authoritative topology instead of stale pre-drag placements", () => {
    const staleState = {
      ...createRouletteBetState(),
      placements: [
        { betId: "straight-24", amount: 80 },
      ],
    };

    setRouletteAuthoritativeDragPlacements([
      { betId: "straight-25", amount: 40 },
      { betId: "straight-24", amount: 40 },
    ]);

    const undone = undoRouletteBet(staleState);
    expect(getRouletteBetTotals(undone.placements)).toEqual({
      "straight-25": 40,
    });

    setRouletteAuthoritativeDragPlacements([
      { betId: "straight-25", amount: 40 },
    ]);
    const cleared = clearRouletteBets(staleState);
    expect(cleared.placements).toEqual([]);
  });

  it("never accepts an older or null same-round bootstrap over confirmed authority", () => {
    const confirmed = {
      roundId: "round-1",
      revision: 8,
      optimistic: false,
    };

    expect(
      shouldAcceptRouletteAuthorityBootstrap(confirmed, "round-1", 5),
    ).toBe(false);
    expect(
      shouldAcceptRouletteAuthorityBootstrap(confirmed, "round-1", null),
    ).toBe(false);
    expect(
      shouldAcceptRouletteAuthorityBootstrap(confirmed, "round-1", 8),
    ).toBe(true);
    expect(
      shouldAcceptRouletteAuthorityBootstrap(confirmed, "round-1", 9),
    ).toBe(true);
  });

  it("keeps optimistic authority against every same-round poll until its write resolves", () => {
    const optimistic = {
      roundId: "round-1",
      revision: 8,
      optimistic: true,
    };

    expect(
      shouldAcceptRouletteAuthorityBootstrap(optimistic, "round-1", 8),
    ).toBe(false);
    expect(
      shouldAcceptRouletteAuthorityBootstrap(optimistic, "round-1", 7),
    ).toBe(false);
    expect(
      shouldAcceptRouletteAuthorityBootstrap(optimistic, "round-1", 9),
    ).toBe(false);
    expect(
      shouldAcceptRouletteAuthorityBootstrap(optimistic, "round-1", 99),
    ).toBe(false);
    expect(
      shouldAcceptRouletteAuthorityBootstrap(optimistic, "round-2", null),
    ).toBe(true);
  });

  it("feeds runtime the accepted authority instead of a delayed stale server snapshot", () => {
    const authority = {
      roundId: "round-1",
      bets: [{ betId: "straight-25", amount: 200 }],
      revision: 8,
      optimistic: false,
    };
    const accepted = globalBet(8, "straight-25", 200);
    const delayed = globalBet(5, "straight-24", 10);

    const selected = selectRouletteRuntimeBootstrapBet(
      authority,
      "round-1",
      delayed,
      accepted,
    );

    expect(selected?.revision).toBe(8);
    expect(selected?.bets).toEqual([
      { betId: "straight-25", amount: 200 },
    ]);
  });

  it("feeds runtime the optimistic moved topology while the serialized write is pending", () => {
    const authority = {
      roundId: "round-1",
      bets: [{ betId: "straight-25", amount: 40 }],
      revision: 8,
      optimistic: true,
    };
    const accepted = globalBet(8, "straight-24", 40);

    const selected = selectRouletteRuntimeBootstrapBet(
      authority,
      "round-1",
      accepted,
      accepted,
    );

    expect(selected?.revision).toBe(8);
    expect(selected?.stakeCents).toBe(4_000);
    expect(selected?.bets).toEqual([
      { betId: "straight-25", amount: 40 },
    ]);
  });
});
