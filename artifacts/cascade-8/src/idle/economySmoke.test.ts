import { describe, expect, it } from "vitest";
import {
  CLUB_STORE_BUSINESS,
  FAN_CLUB_BUSINESS,
  STADIUM_BUSINESS,
  TOTAL_VAULT_UPGRADE_COST_PERCENT,
  VAULT_LEVELS,
  VAULT_UPGRADE_STEPS,
} from "./config";
import { getIdleTotalPassiveIncomeCentsPerHour } from "./services";
import type { IdleBusinessServerState } from "./types";

const expectedEconomy = {
  stadium: {
    costs: [50_000, 200_000, 500_000, 2_000_000, 8_000_000, 30_000_000, 120_000_000, 500_000_000, 2_000_000_000],
    daily: [10_000, 36_000, 86_000, 152_700, 286_000, 619_300, 1_476_500, 4_108_100, 12_441_400],
    hourlyDisplay: [417, 1_500, 3_583, 6_361, 11_917, 25_806, 61_520, 171_169, 518_391],
  },
  "club-store": {
    costs: [30_000, 120_000, 300_000, 1_000_000, 3_500_000, 12_000_000, 45_000_000, 180_000_000, 700_000_000],
    daily: [7_500, 27_500, 57_500, 97_500, 167_500, 317_500, 692_500, 1_751_300, 4_933_100],
    hourlyDisplay: [313, 1_146, 2_396, 4_063, 6_979, 13_229, 28_854, 72_972, 205_545],
  },
  "fan-club": {
    costs: [10_000, 40_000, 100_000, 300_000, 1_000_000, 3_500_000, 12_000_000, 45_000_000, 150_000_000],
    daily: [3_300, 11_300, 23_800, 40_500, 69_100, 127_400, 247_400, 547_400, 1_297_400],
    hourlyDisplay: [139, 472, 993, 1_688, 2_878, 5_309, 10_309, 22_809, 54_059],
  },
} as const;

const definitions = [
  STADIUM_BUSINESS,
  CLUB_STORE_BUSINESS,
  FAN_CLUB_BUSINESS,
] as const;

function maxState(
  businessId: IdleBusinessServerState["businessId"],
): IdleBusinessServerState {
  return {
    businessId,
    businessLevel: 8,
    vaultLevel: 6,
    accruedMicrocents: 0,
    vaultCapacityMicrocents: 0,
    remainingCapacityMicrocents: 0,
    isVaultFull: false,
    checkpointAt: "2026-09-25T00:00:00.000Z",
  };
}

describe("final idle economy smoke", () => {
  it("keeps all three approved nine-level business tables exact", () => {
    for (const definition of definitions) {
      const expected = expectedEconomy[definition.id];
      expect(definition.levels.map((level) => level.level)).toEqual(
        [0, 1, 2, 3, 4, 5, 6, 7, 8],
      );
      expect(definition.levels.map((level) => level.costCents)).toEqual(
        expected.costs,
      );
      expect(definition.levels.map((level) => level.dailyIncomeCents)).toEqual(
        expected.daily,
      );
      expect(
        definition.levels.map((level) => level.hourlyIncomeDisplayCents),
      ).toEqual(expected.hourlyDisplay);
    }
  });

  it("keeps the approved Kasa capacity and pricing ladder exact", () => {
    expect(VAULT_LEVELS.map((entry) => entry.capacityHours)).toEqual(
      [1, 2, 4, 8, 12, 24],
    );
    expect(VAULT_UPGRADE_STEPS.map((entry) => entry.costPercent)).toEqual(
      [5, 10, 15, 25, 40],
    );
    expect(TOTAL_VAULT_UPGRADE_COST_PERCENT).toBe(95);
  });

  it("keeps the max aggregate economy at $186,719 per day", () => {
    const maxDailyIncomeCents = definitions.reduce(
      (total, definition) => total + definition.levels[8].dailyIncomeCents,
      0,
    );

    expect(maxDailyIncomeCents).toBe(18_671_900);
    expect(
      getIdleTotalPassiveIncomeCentsPerHour([
        maxState("stadium"),
        maxState("club-store"),
        maxState("fan-club"),
      ]),
    ).toBe(maxDailyIncomeCents / 24);
  });
});
