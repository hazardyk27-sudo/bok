import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BETS_CENTS,
  MAX_WIN_MULTIPLIER,
} from "../../../cascade-8/src/config/GameConfig";
import { SeededRNG } from "../../../cascade-8/src/engine/RNG";
import { playSpin } from "../../../cascade-8/src/engine/SlotEngine";

const source = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("Slot high-stake regression", () => {
  it("accepts the $50,000 stake in the canonical bet ladder", () => {
    const fiftyThousandDollarBetCents = 5_000_000;
    expect(BETS_CENTS).toContain(fiftyThousandDollarBetCents);

    const result = playSpin(
      fiftyThousandDollarBetCents,
      new SeededRNG("slot-high-stake-50k"),
    );

    expect(result.betCents).toBe(fiftyThousandDollarBetCents);
    expect(Number.isSafeInteger(result.totalWinCents)).toBe(true);
    expect(result.totalWinCents).toBeLessThanOrEqual(
      fiftyThousandDollarBetCents * MAX_WIN_MULTIPLIER,
    );
  });

  it("keeps the full configured max-bet payout inside JavaScript safe integers", () => {
    const maxBetCents = BETS_CENTS.at(-1)!;
    expect(Number.isSafeInteger(maxBetCents * MAX_WIN_MULTIPLIER)).toBe(true);
  });

  it("keeps Slot settlement money bigint-safe in SQL and schema", () => {
    const repository = source("./repository.ts");
    const schema = source("../../../../lib/db/src/schema/slot.ts");

    expect(repository).toContain("::bigint");
    expect(repository).not.toContain("::integer");
    expect(schema).toContain('bigint("stake_cents"');
    expect(schema).toContain('bigint("payout_cents"');
    expect(schema).toContain('bigint("amount_cents"');
  });
});
