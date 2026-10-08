import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  commitRouletteSequentialChipMove,
  createRouletteMovedBets,
} from "./chipDragV6";
import type { RouletteWalletClient } from "./rouletteWalletClient";

const dragSource = readFileSync(
  new URL("./chipDragV6.ts", import.meta.url),
  "utf8",
);

describe("roulette single-authority chip drag v6", () => {
  it("moves the same wager repeatedly without changing total stake", () => {
    let bets = [{ betId: "straight-14", amount: 10 }];

    bets = createRouletteMovedBets(
      bets,
      "straight-14",
      "straight-17",
    );
    bets = createRouletteMovedBets(
      bets,
      "straight-17",
      "straight-20",
    );
    bets = createRouletteMovedBets(
      bets,
      "straight-20",
      "straight-23",
    );

    expect(bets).toEqual([
      { betId: "straight-23", amount: 10 },
    ]);
    expect(
      bets.reduce((sum, bet) => sum + bet.amount, 0),
    ).toBe(10);
  });

  it("frees the source cell and merges into an occupied target", () => {
    const moved = createRouletteMovedBets(
      [
        { betId: "straight-24", amount: 80 },
        { betId: "straight-25", amount: 20 },
      ],
      "straight-24",
      "straight-25",
    );

    expect(moved).toEqual([
      { betId: "straight-25", amount: 80 },
      { betId: "straight-25", amount: 20 },
    ]);
    expect(
      moved
        .filter((bet) => bet.betId === "straight-25")
        .reduce((sum, bet) => sum + bet.amount, 0),
    ).toBe(100);
    expect(
      moved.some((bet) => bet.betId === "straight-24"),
    ).toBe(false);
  });

  it("commits each drop with exactly one wallet write and no bootstrap polling", async () => {
    const updateGlobalBet = vi.fn(async (
      roundId: string,
      bets: readonly { betId: string; amount: number }[],
      idempotencyKey: string,
      expectedRevision: number,
    ) => {
      expect(roundId).toBe("round-1");
      expect(expectedRevision).toBe(7);
      expect(idempotencyKey.startsWith("roulette_move_v6_")).toBe(true);
      return {
        globalBet: {
          id: "bet-1",
          roundId,
          bets: bets.map((bet) => ({ ...bet })),
          stakeCents: 1_000,
          payoutCents: 0,
          revision: 8,
          settlement: null,
          settledAtMs: null,
          updatedAtMs: Date.now(),
        },
        balanceCents: 100_000,
      };
    });

    const wallet = {
      updateGlobalBet,
    } as unknown as Pick<
      RouletteWalletClient,
      "updateGlobalBet"
    >;

    const result = await commitRouletteSequentialChipMove(
      wallet,
      "round-1",
      7,
      [{ betId: "straight-24", amount: 10 }],
      "straight-24",
      "straight-25",
    );

    expect(updateGlobalBet).toHaveBeenCalledTimes(1);
    expect(updateGlobalBet.mock.calls[0]?.[1]).toEqual([
      { betId: "straight-25", amount: 10 },
    ]);
    expect(result).toEqual([
      { betId: "straight-25", amount: 10 },
    ]);
  });

  it("rejects a move whose source no longer exists", () => {
    expect(() =>
      createRouletteMovedBets(
        [{ betId: "straight-25", amount: 10 }],
        "straight-24",
        "straight-26",
      ),
    ).toThrow("ROULETTE_DRAG_SOURCE_MISSING");
  });

  it("re-reads authority after the visual snap instead of committing the drop snapshot", () => {
    const snapIndex = dragSource.indexOf(
      "snapGhostToCell(completed, targetCell);",
    );
    const latestAuthorityIndex = dragSource.indexOf(
      "const latestAuthority =",
    );

    expect(snapIndex).toBeGreaterThanOrEqual(0);
    expect(latestAuthorityIndex).toBeGreaterThan(snapIndex);
    expect(dragSource).not.toContain(
      "authority.roundId!,\n        authority.revision,\n        currentBets",
    );
  });
});
