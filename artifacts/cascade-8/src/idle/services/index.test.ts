import { describe, expect, it } from "vitest";
import type { IdleBusinessServerState, IdleLiveBusinessState } from "../types";
import {
  getIdleTotalCollectableCents,
  projectIdleBusinessLive,
} from "./index";

const MICRO_CENTS_PER_CENT = 1_000_000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function createStadiumLevelZeroState(): IdleBusinessServerState {
  const dailyIncomeCents = 10_000;
  const oneHourCapacityMicrocents = Math.floor(
    dailyIncomeCents * MICRO_CENTS_PER_CENT / 24,
  );

  return {
    businessId: "stadium",
    businessLevel: 0,
    vaultLevel: 1,
    accruedMicrocents: 0,
    vaultCapacityMicrocents: oneHourCapacityMicrocents,
    remainingCapacityMicrocents: oneHourCapacityMicrocents,
    isVaultFull: false,
    checkpointAt: "2026-09-25T00:00:00.000Z",
  };
}

describe("idle collectable totals", () => {
  it("sums already-settled whole cents per business without pooling fractions", () => {
    const base = projectIdleBusinessLive(createStadiumLevelZeroState(), 0);
    const businesses: IdleLiveBusinessState[] = [
      { ...base, collectableCents: 1 },
      { ...base, businessId: "club-store", collectableCents: 1 },
      { ...base, businessId: "fan-club", collectableCents: 0 },
    ];

    expect(getIdleTotalCollectableCents(businesses)).toBe(2);
  });
});

describe("Lv1 one-hour vault", () => {
  it("fills exactly at one hour and never grows beyond the cap", () => {
    const state = createStadiumLevelZeroState();

    const beforeFull = projectIdleBusinessLive(state, ONE_HOUR_MS - 1);
    const atFull = projectIdleBusinessLive(state, ONE_HOUR_MS);
    const longAfterFull = projectIdleBusinessLive(state, ONE_HOUR_MS * 8);

    expect(beforeFull.liveIsVaultFull).toBe(false);
    expect(beforeFull.liveAccruedMicrocents).toBeLessThan(
      state.vaultCapacityMicrocents,
    );

    expect(atFull.liveIsVaultFull).toBe(true);
    expect(atFull.liveAccruedMicrocents).toBe(
      state.vaultCapacityMicrocents,
    );
    expect(atFull.liveRemainingCapacityMicrocents).toBe(0);

    expect(longAfterFull.liveIsVaultFull).toBe(true);
    expect(longAfterFull.liveAccruedMicrocents).toBe(
      state.vaultCapacityMicrocents,
    );
    expect(longAfterFull.collectableCents).toBe(
      Math.floor(state.vaultCapacityMicrocents / MICRO_CENTS_PER_CENT),
    );
  });
});
