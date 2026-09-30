import { describe, expect, it } from "vitest";
import {
  projectIdleStadiumLive,
} from "./index";
import type {
  IdleStadiumStateEnvelope,
} from "../types";

function makeEnvelope(
  overrides: Partial<
    IdleStadiumStateEnvelope["snapshot"]["stadium"]
  > = {},
): IdleStadiumStateEnvelope {
  return {
    receivedAtMs: 1_000,
    snapshot: {
      sessionId: "session",
      serverTime: "2026-09-30T00:00:00.000Z",
      wallet: {
        sessionId: "session",
        balanceCents: 100_000,
      },
      market: {
        priceMicrodollars: 4_000_000,
        source: "binance-btcusdt",
        feedStatus: "LIVE",
        tickAt: "2026-09-30T00:00:00.000Z",
      },
      stadium: {
        stadiumLevel: 1,
        ownedSeats: 1_000,
        maxSeatCapacity: 1_000,
        speedLevel: 1,
        storageLevel: 1,
        storedMicroTickets: 0,
        storageCapacityTickets: 25,
        remainingStorageMicroTickets:
          25_000_000,
        productionRateMicroTicketsPerHour:
          2_000_000,
        isStorageFull: false,
        productionStatus: "PRODUCING",
        productionCheckpointAt:
          "2026-09-30T00:00:00.000Z",
        ...overrides,
      },
    },
  };
}

describe("canonical Stadium live projection", () => {
  it("projects production from browser elapsed time without using wall-clock/server skew", () => {
    const live = projectIdleStadiumLive(
      makeEnvelope(),
      1_000 + 30 * 60 * 1_000,
    );

    expect(live.liveStoredMicroTickets)
      .toBe(1_000_000);
    expect(live.liveRemainingStorageMicroTickets)
      .toBe(24_000_000);
    expect(live.liveProductionStatus)
      .toBe("PRODUCING");
  });

  it("stops display projection exactly at Storage capacity", () => {
    const live = projectIdleStadiumLive(
      makeEnvelope({
        storedMicroTickets: 24_500_000,
        remainingStorageMicroTickets: 500_000,
      }),
      1_000 + 60 * 60 * 1_000,
    );

    expect(live.liveStoredMicroTickets)
      .toBe(25_000_000);
    expect(live.liveRemainingStorageMicroTickets)
      .toBe(0);
    expect(live.liveIsStorageFull).toBe(true);
    expect(live.liveProductionStatus)
      .toBe("STORAGE_FULL");
    expect(live.storageFillRatio).toBe(1);
  });

  it("keeps zero-seat Stadiums in NO_SEATS state", () => {
    const live = projectIdleStadiumLive(
      makeEnvelope({
        ownedSeats: 0,
        productionRateMicroTicketsPerHour: 0,
        productionStatus: "NO_SEATS",
      }),
      1_000 + 24 * 60 * 60 * 1_000,
    );

    expect(live.liveStoredMicroTickets).toBe(0);
    expect(live.liveProductionStatus)
      .toBe("NO_SEATS");
  });

  it("never projects backwards when the supplied browser time precedes receipt time", () => {
    const live = projectIdleStadiumLive(
      makeEnvelope({
        storedMicroTickets: 3_500_000,
        remainingStorageMicroTickets:
          21_500_000,
      }),
      0,
    );

    expect(live.liveStoredMicroTickets)
      .toBe(3_500_000);
  });
});
