import { describe, expect, it } from "vitest";
import {
  ADVANCED_ALARM_OPTIONS,
  ADVANCED_PAYOUT_TABLES,
  STANDARD_CASHOUT_MULTIPLIERS_BPS,
  getCashoutMultiplierBps,
  getSafeCellCount,
} from "./types";

describe("Cadı Kazan payout configuration", () => {
  it("keeps the Standard progression exact", () => {
    expect(STANDARD_CASHOUT_MULTIPLIERS_BPS).toEqual([120, 160, 240, 480]);
    expect(getCashoutMultiplierBps("STANDARD", 1, 1)).toBe(120);
    expect(getCashoutMultiplierBps("STANDARD", 1, 4)).toBe(480);
  });

  it("provides replaceable conservative tables for every Advanced alarm option", () => {
    for (const alarmCount of ADVANCED_ALARM_OPTIONS) {
      const table = ADVANCED_PAYOUT_TABLES[alarmCount];
      expect(table.calibration).toBe("TEMPORARY_CONSERVATIVE");
      expect(table.multipliersBps).toHaveLength(getSafeCellCount("ADVANCED", alarmCount));
      expect(table.multipliersBps.every((value, index) => index === 0 || value >= table.multipliersBps[index - 1])).toBe(true);
    }
  });
});