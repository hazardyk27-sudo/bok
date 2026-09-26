import { describe, expect, it } from "vitest";
import type {
  IdleBusinessServerState,
  IdleLiveBusinessState,
  IdleStateEnvelope,
} from "../types";
import {
  getIdleTotalCollectableCents,
  projectIdleBusinessLive,
  projectIdleStateLive,
} from "./index";

const MICRO_CENTS_PER_CENT = 1_000_000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

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


describe("Lv6 twenty-four-hour vault", () => {
  it("fills exactly at 24 hours and never grows beyond one full day", () => {
    const dailyIncomeCents = 10_000;
    const capacityMicrocents = dailyIncomeCents * MICRO_CENTS_PER_CENT;
    const state: IdleBusinessServerState = {
      ...createStadiumLevelZeroState(),
      vaultLevel: 6,
      vaultCapacityMicrocents: capacityMicrocents,
      remainingCapacityMicrocents: capacityMicrocents,
    };

    const beforeFull = projectIdleBusinessLive(state, ONE_DAY_MS - 1);
    const atFull = projectIdleBusinessLive(state, ONE_DAY_MS);
    const threeDaysLater = projectIdleBusinessLive(state, ONE_DAY_MS * 3);

    expect(beforeFull.liveIsVaultFull).toBe(false);
    expect(beforeFull.liveAccruedMicrocents).toBeLessThan(capacityMicrocents);

    expect(atFull.liveIsVaultFull).toBe(true);
    expect(atFull.liveAccruedMicrocents).toBe(capacityMicrocents);
    expect(atFull.liveRemainingCapacityMicrocents).toBe(0);
    expect(atFull.collectableCents).toBe(dailyIncomeCents);

    expect(threeDaysLater.liveIsVaultFull).toBe(true);
    expect(threeDaysLater.liveAccruedMicrocents).toBe(capacityMicrocents);
    expect(threeDaysLater.collectableCents).toBe(dailyIncomeCents);
  });
});


describe("offline accrual handoff", () => {
  it("starts from the server-projected offline balance and only adds browser elapsed time once", () => {
    const base = createStadiumLevelZeroState();
    const sixHoursOffline = projectIdleBusinessLive(base, ONE_HOUR_MS * 6);

    const serverSnapshot: IdleBusinessServerState = {
      businessId: sixHoursOffline.businessId,
      businessLevel: sixHoursOffline.businessLevel,
      vaultLevel: sixHoursOffline.vaultLevel,
      accruedMicrocents: sixHoursOffline.liveAccruedMicrocents,
      vaultCapacityMicrocents: sixHoursOffline.vaultCapacityMicrocents,
      remainingCapacityMicrocents: sixHoursOffline.liveRemainingCapacityMicrocents,
      isVaultFull: sixHoursOffline.liveIsVaultFull,
      checkpointAt: "2026-09-25T06:00:00.000Z",
    };

    const envelope: IdleStateEnvelope = {
      snapshot: {
        sessionId: "offline-test",
        serverTime: "2026-09-25T06:00:00.000Z",
        wallet: { sessionId: "offline-test", balanceCents: 100_000 },
        businesses: [serverSnapshot],
      },
      receivedAtMs: 1_000_000,
    };

    const onArrival = projectIdleStateLive(envelope, envelope.receivedAtMs)
      .businesses[0];
    const thirtyMinutesLater = projectIdleStateLive(
      envelope,
      envelope.receivedAtMs + ONE_HOUR_MS / 2,
    ).businesses[0];

    expect(onArrival.liveAccruedMicrocents).toBe(
      serverSnapshot.accruedMicrocents,
    );
    expect(thirtyMinutesLater.liveAccruedMicrocents).toBe(
      Math.min(
        serverSnapshot.vaultCapacityMicrocents,
        serverSnapshot.accruedMicrocents
          + Math.floor(10_000 * MICRO_CENTS_PER_CENT / 48),
      ),
    );
  });

  it("never uses serverTime versus the device clock to invent offline income", () => {
    const base = createStadiumLevelZeroState();
    const envelope: IdleStateEnvelope = {
      snapshot: {
        sessionId: "clock-skew-test",
        serverTime: "2000-01-01T00:00:00.000Z",
        wallet: { sessionId: "clock-skew-test", balanceCents: 100_000 },
        businesses: [base],
      },
      receivedAtMs: 5_000,
    };

    const live = projectIdleStateLive(envelope, 5_000).businesses[0];

    expect(live.liveAccruedMicrocents).toBe(0);
    expect(live.liveIsVaultFull).toBe(false);
  });
});


describe("critical live-state regression", () => {
  it("keeps an unowned business fully locked with no phantom income or collection", () => {
    const state: IdleBusinessServerState = {
      ...createStadiumLevelZeroState(),
      businessLevel: null,
      accruedMicrocents: 99_000_000,
      remainingCapacityMicrocents: 0,
      isVaultFull: true,
    };

    const live = projectIdleBusinessLive(state, ONE_DAY_MS);

    expect(live.vaultStatus).toBe("UNOWNED");
    expect(live.liveAccruedMicrocents).toBe(0);
    expect(live.liveRemainingCapacityMicrocents).toBe(0);
    expect(live.liveIsVaultFull).toBe(false);
    expect(live.collectableCents).toBe(0);
    expect(live.canCollect).toBe(false);
  });

  it("does not enable Collect until at least one whole cent exists", () => {
    const state: IdleBusinessServerState = {
      ...createStadiumLevelZeroState(),
      accruedMicrocents: 999_999,
      remainingCapacityMicrocents:
        createStadiumLevelZeroState().vaultCapacityMicrocents - 999_999,
    };

    const live = projectIdleBusinessLive(state, 0);

    expect(live.liveAccruedMicrocents).toBe(999_999);
    expect(live.collectableCents).toBe(0);
    expect(live.canCollect).toBe(false);
    expect(live.vaultStatus).toBe("EARNING");
  });

  it("marks a capped vault FULL and exposes only whole cents as collectable", () => {
    const state = createStadiumLevelZeroState();
    const live = projectIdleBusinessLive(state, ONE_HOUR_MS);

    expect(live.vaultStatus).toBe("FULL");
    expect(live.liveIsVaultFull).toBe(true);
    expect(live.vaultFillRatio).toBe(1);
    expect(live.liveRemainingCapacityMicrocents).toBe(0);
    expect(live.canCollect).toBe(true);
    expect(live.collectableCents).toBe(
      Math.floor(state.vaultCapacityMicrocents / MICRO_CENTS_PER_CENT),
    );
  });

  it("preserves already-earned money above a reset Lv1 Kasa cap until Collect", () => {
    const state = createStadiumLevelZeroState();
    const overCapAccrued = state.vaultCapacityMicrocents + 25_000_000;
    const afterMainUpgradeReset: IdleBusinessServerState = {
      ...state,
      businessLevel: 1,
      vaultLevel: 1,
      accruedMicrocents: overCapAccrued,
      remainingCapacityMicrocents: 0,
      isVaultFull: false,
    };

    const live = projectIdleBusinessLive(afterMainUpgradeReset, 0);

    expect(live.liveAccruedMicrocents).toBe(overCapAccrued);
    expect(live.liveRemainingCapacityMicrocents).toBe(0);
    expect(live.liveIsVaultFull).toBe(true);
    expect(live.vaultStatus).toBe("FULL");
    expect(live.collectableCents).toBe(
      Math.floor(overCapAccrued / MICRO_CENTS_PER_CENT),
    );
  });
});
