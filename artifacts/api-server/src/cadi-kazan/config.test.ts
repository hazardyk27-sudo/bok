import { describe, expect, it } from "vitest";
import {
  ADVANCED_ALARM_OPTIONS,
  ADVANCED_PAYOUT_TABLES,
  STANDARD_CASHOUT_MULTIPLIERS_BPS,
  getCashoutMultiplierBps,
  getCashoutPayoutCents,
  getSafeCellCount,
  getVisibleBombCells,
} from "./types";

describe("Cadı Kazan payout configuration", () => {
  it("keeps the Standard progression exact", () => {
    expect(STANDARD_CASHOUT_MULTIPLIERS_BPS).toEqual([120, 160, 240, 480]);
    expect(getCashoutMultiplierBps("STANDARD", 1, 1)).toBe(120);
    expect(getCashoutMultiplierBps("STANDARD", 1, 4)).toBe(480);
  });

  it("provides final data-driven tables for every Advanced bomb option", () => {
    for (const alarmCount of ADVANCED_ALARM_OPTIONS) {
      const table = ADVANCED_PAYOUT_TABLES[alarmCount];
      expect(table.calibration).toBe("FINAL_DATA_DRIVEN");
      expect(table.version).toBe("advanced-final-v1");
      expect(table.targetRtpBps).toBe(9_600);
      expect(table.maxMultiplierBps).toBe(100_000);
      expect(table.multipliersBps).toHaveLength(getSafeCellCount("ADVANCED", alarmCount));
      expect(table.multipliersBps.every((value, index) => index === 0 || value >= table.multipliersBps[index - 1])).toBe(true);
      expect(Math.max(...table.multipliersBps)).toBeLessThanOrEqual(100_000);
    }
  });

  it("keeps Advanced early cashout points inside the RTP target band", () => {
    for (const alarmCount of ADVANCED_ALARM_OPTIONS) {
      const table = ADVANCED_PAYOUT_TABLES[alarmCount];
      for (let safeCount = 1; safeCount <= Math.min(5, table.safeCellCount); safeCount += 1) {
        let survival = 1;
        for (let index = 0; index < safeCount; index += 1) {
          survival *= (25 - alarmCount - index) / (25 - index);
        }
        const rtp = survival * (table.multipliersBps[safeCount - 1] / 100);
        expect(rtp).toBeGreaterThanOrEqual(0.955);
        expect(rtp).toBeLessThanOrEqual(0.965);
      }
    }
  });

  it("redacts bomb positions during active play and exposes the final board only after terminal state", () => {
    expect(getVisibleBombCells("ACTIVE", [1, 4, 9])).toEqual([]);
    expect(getVisibleBombCells("CASHED_OUT", [1, 4, 9])).toEqual([1, 4, 9]);
    expect(getVisibleBombCells("BUST", [1])).toEqual([1]);
    expect(getVisibleBombCells("COMPLETED", [0, 24])).toEqual([0, 24]);
  });

  it("keeps cash-out amount calculation server-owned", () => {
    expect(getCashoutPayoutCents(100, 120)).toBe(120);
    expect(getCashoutPayoutCents(333, 157)).toBe(522);
  });
});