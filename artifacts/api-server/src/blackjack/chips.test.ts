import { describe, expect, it } from "vitest";
import {
  BLACKJACK_BASE_CHIP_VALUES_CENTS,
  BLACKJACK_HIGH_ROLLER_START_CENTS,
  doubleBlackjackHighRollerChipCents,
  getBlackjackChipCredits,
  getBlackjackChipDenominationsUpToCents,
  getNextBlackjackChipDenominationCents,
  getPreviousBlackjackChipDenominationCents,
  isBlackjackChipDenominationCents,
} from "./chips";

describe("blackjack chip denomination engine", () => {
  it("locks the base tray to 10, 25, 50, 100, 250, 500 and 1K", () => {
    expect(BLACKJACK_BASE_CHIP_VALUES_CENTS).toEqual([
      1_000,
      2_500,
      5_000,
      10_000,
      25_000,
      50_000,
      100_000,
    ]);
    expect(
      BLACKJACK_BASE_CHIP_VALUES_CENTS.map(getBlackjackChipCredits),
    ).toEqual([10, 25, 50, 100, 250, 500, 1_000]);
  });

  it("continues from 1K with an exact unbounded-by-game x2 chain", () => {
    let chip: number = BLACKJACK_HIGH_ROLLER_START_CENTS;
    const credits: number[] = [getBlackjackChipCredits(chip)];

    for (let index = 0; index < 8; index += 1) {
      chip = doubleBlackjackHighRollerChipCents(chip);
      credits.push(getBlackjackChipCredits(chip));
    }

    expect(credits).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      16_000,
      32_000,
      64_000,
      128_000,
      256_000,
    ]);
  });

  it("uses the fixed tray below 1K and x2 progression above it", () => {
    expect(getNextBlackjackChipDenominationCents(1_000)).toBe(2_500);
    expect(getNextBlackjackChipDenominationCents(25_000)).toBe(50_000);
    expect(getNextBlackjackChipDenominationCents(50_000)).toBe(100_000);
    expect(getNextBlackjackChipDenominationCents(100_000)).toBe(200_000);
    expect(getNextBlackjackChipDenominationCents(200_000)).toBe(400_000);

    expect(getPreviousBlackjackChipDenominationCents(100_000)).toBe(50_000);
    expect(getPreviousBlackjackChipDenominationCents(200_000)).toBe(100_000);
    expect(getPreviousBlackjackChipDenominationCents(1_000)).toBeNull();
  });

  it("accepts only canonical fixed or high-roller denominations", () => {
    for (const value of [
      1_000,
      2_500,
      5_000,
      10_000,
      25_000,
      50_000,
      100_000,
      200_000,
      400_000,
      800_000,
      1_600_000,
    ]) {
      expect(isBlackjackChipDenominationCents(value)).toBe(true);
    }

    for (const value of [
      0,
      -1,
      20_000,
      75_000,
      150_000,
      300_000,
      1.5,
    ]) {
      expect(isBlackjackChipDenominationCents(value)).toBe(false);
    }
  });

  it("generates every usable denomination up to the player's available balance", () => {
    expect(getBlackjackChipDenominationsUpToCents(1_600_000)).toEqual([
      1_000,
      2_500,
      5_000,
      10_000,
      25_000,
      50_000,
      100_000,
      200_000,
      400_000,
      800_000,
      1_600_000,
    ]);

    expect(getBlackjackChipDenominationsUpToCents(900)).toEqual([]);
    expect(getBlackjackChipDenominationsUpToCents(50_000)).toEqual([
      1_000,
      2_500,
      5_000,
      10_000,
      25_000,
      50_000,
    ]);
  });

  it("has no arbitrary game cap but refuses unsafe integer overflow", () => {
    let chip: number = BLACKJACK_HIGH_ROLLER_START_CENTS;
    for (let index = 0; index < 20; index += 1) {
      chip = doubleBlackjackHighRollerChipCents(chip);
    }

    expect(getBlackjackChipCredits(chip)).toBe(1_048_576_000);

    let nearLimit: number = BLACKJACK_HIGH_ROLLER_START_CENTS;
    while (nearLimit <= Math.floor(Number.MAX_SAFE_INTEGER / 2)) {
      nearLimit = doubleBlackjackHighRollerChipCents(nearLimit);
    }
    expect(() => doubleBlackjackHighRollerChipCents(nearLimit)).toThrow(
      /safe integer range/,
    );
  });

  it("rejects invalid x2 starting values instead of inventing denominations", () => {
    expect(() => doubleBlackjackHighRollerChipCents(50_000)).toThrow(/1K/);
    expect(() => doubleBlackjackHighRollerChipCents(150_000)).toThrow(/1K/);
    expect(() => getNextBlackjackChipDenominationCents(20_000)).toThrow(
      /valid denomination/,
    );
  });
});
