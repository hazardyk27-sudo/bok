import { describe, expect, it } from "vitest";
import {
  applyRouletteBetMoveGuard,
  deriveRouletteBetMoveGuard,
} from "./rouletteWalletClient";

describe("roulette drag move guard", () => {
  it("derives a whole-cell move and rewrites a stale runtime snapshot", () => {
    const before = [
      { betId: "straight:14", amount: 10 },
    ];
    const after = [
      { betId: "straight:17", amount: 10 },
    ];
    const guard = deriveRouletteBetMoveGuard(
      "round-1",
      before,
      after,
      1_000,
    );

    expect(guard).toMatchObject({
      roundId: "round-1",
      fromBetId: "straight:14",
      toBetId: "straight:17",
      confirmedRevision: null,
    });

    expect(
      applyRouletteBetMoveGuard(
        guard,
        "round-1",
        before,
        1_001,
      ),
    ).toEqual(after);
  });

  it("preserves unrelated new bets while preventing the moved chip from returning", () => {
    const guard = deriveRouletteBetMoveGuard(
      "round-2",
      [
        { betId: "straight:14", amount: 10 },
        { betId: "straight:20", amount: 50 },
      ],
      [
        { betId: "straight:17", amount: 10 },
        { betId: "straight:20", amount: 50 },
      ],
      2_000,
    );

    expect(
      applyRouletteBetMoveGuard(
        guard,
        "round-2",
        [
          { betId: "straight:14", amount: 10 },
          { betId: "straight:20", amount: 50 },
          { betId: "straight:31", amount: 100 },
        ],
        2_100,
      ),
    ).toEqual([
      { betId: "straight:17", amount: 10 },
      { betId: "straight:20", amount: 50 },
      { betId: "straight:31", amount: 100 },
    ]);
  });

  it("does not rewrite another round or an expired guard", () => {
    const guard = deriveRouletteBetMoveGuard(
      "round-3",
      [{ betId: "straight:14", amount: 10 }],
      [{ betId: "straight:17", amount: 10 }],
      3_000,
    );
    const stale = [
      { betId: "straight:14", amount: 10 },
    ];

    expect(
      applyRouletteBetMoveGuard(
        guard,
        "round-other",
        stale,
        3_100,
      ),
    ).toEqual(stale);

    expect(
      applyRouletteBetMoveGuard(
        guard,
        "round-3",
        stale,
        6_001,
      ),
    ).toEqual(stale);
  });

  it("rejects non-move topology changes", () => {
    expect(
      deriveRouletteBetMoveGuard(
        "round-4",
        [{ betId: "straight:14", amount: 10 }],
        [
          { betId: "straight:17", amount: 5 },
          { betId: "straight:20", amount: 5 },
        ],
      ),
    ).toBeNull();
  });
});
