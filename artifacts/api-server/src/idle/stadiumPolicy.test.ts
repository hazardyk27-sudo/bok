import { describe, expect, it } from "vitest";
import {
  applyStadiumEconomyMutationPatch,
} from "./stadiumPolicy";
import { projectStadiumTicketProduction } from "./production";
import type { StadiumStorageState } from "./stadiumRepository";

function makeState(
  overrides: Partial<StadiumStorageState> = {},
): StadiumStorageState {
  const checkpoint = new Date("2026-09-29T00:00:00.000Z");
  return {
    id: "stadium-state",
    sessionId: "session",
    stadiumLevel: 1,
    ownedSeats: 1_000,
    speedLevel: 1,
    storageLevel: 2,
    storedMicroTickets: 0,
    saleRemainderMicrodollars: 0,
    productionCheckpointAt: checkpoint,
    createdAt: checkpoint,
    updatedAt: checkpoint,
    ...overrides,
  };
}

describe("Stadium mutation policy", () => {
  it("keeps elapsed production on the old Speed before a Speed upgrade", () => {
    const oldState = makeState();
    const upgradeAt = new Date("2026-09-29T10:00:00.000Z");

    const oldProjection = projectStadiumTicketProduction({
      ownedSeats: oldState.ownedSeats,
      speedLevel: oldState.speedLevel,
      storageLevel: oldState.storageLevel,
      storedMicroTickets: oldState.storedMicroTickets,
      elapsedMs: upgradeAt.getTime() - oldState.productionCheckpointAt.getTime(),
    });

    // 1,000 seats × Speed Lv1 = 2 tickets/hour × 10h = 20 tickets.
    expect(oldProjection.liveStoredMicroTickets).toBe(20_000_000);

    const settledState: StadiumStorageState = {
      ...oldState,
      storedMicroTickets: oldProjection.liveStoredMicroTickets,
      productionCheckpointAt: upgradeAt,
      updatedAt: upgradeAt,
    };

    const upgraded = applyStadiumEconomyMutationPatch(
      settledState,
      { speedLevel: 2 },
    );

    expect(upgraded.speedLevel).toBe(2);
    expect(upgraded.storedMicroTickets).toBe(20_000_000);

    const oneHourLater = projectStadiumTicketProduction({
      ownedSeats: upgraded.ownedSeats,
      speedLevel: upgraded.speedLevel,
      storageLevel: upgraded.storageLevel,
      storedMicroTickets: upgraded.storedMicroTickets,
      elapsedMs: 60 * 60 * 1_000,
    });

    // Only the NEW hour receives Speed Lv2 (2.5 tickets/hour).
    expect(oneHourLater.liveStoredMicroTickets).toBe(22_500_000);
  });

  it("does not allow progression or seat-count downgrades", () => {
    const state = makeState({
      stadiumLevel: 5,
      ownedSeats: 20_000,
      speedLevel: 10,
      storageLevel: 10,
    });

    expect(() => applyStadiumEconomyMutationPatch(
      state,
      { stadiumLevel: 4 },
    )).toThrow("IDLE_STADIUM_LEVEL_DOWNGRADE_NOT_ALLOWED");

    expect(() => applyStadiumEconomyMutationPatch(
      state,
      { speedLevel: 9 },
    )).toThrow("IDLE_SPEED_LEVEL_DOWNGRADE_NOT_ALLOWED");

    expect(() => applyStadiumEconomyMutationPatch(
      state,
      { storageLevel: 9 },
    )).toThrow("IDLE_STORAGE_LEVEL_DOWNGRADE_NOT_ALLOWED");

    expect(() => applyStadiumEconomyMutationPatch(
      state,
      { ownedSeats: 19_999 },
    )).toThrow("IDLE_SEAT_COUNT_DECREASE_NOT_ALLOWED");
  });

  it("rejects seats beyond the capacity unlocked by the resulting Stadium level", () => {
    const state = makeState({
      stadiumLevel: 1,
      ownedSeats: 1_000,
    });

    expect(() => applyStadiumEconomyMutationPatch(
      state,
      { ownedSeats: 1_001 },
    )).toThrow("IDLE_STADIUM_CAPACITY_EXCEEDED");

    const unlocked = applyStadiumEconomyMutationPatch(
      state,
      { stadiumLevel: 2, ownedSeats: 1_001 },
    );
    expect(unlocked.stadiumLevel).toBe(2);
    expect(unlocked.ownedSeats).toBe(1_001);
  });

  it("rejects stored inventory beyond the resulting Storage capacity", () => {
    const state = makeState({
      storageLevel: 1,
      storedMicroTickets: 25_000_000,
    });

    expect(() => applyStadiumEconomyMutationPatch(
      state,
      { storedMicroTickets: 25_000_001 },
    )).toThrow("IDLE_STORED_TICKETS_EXCEED_CAPACITY");

    const expanded = applyStadiumEconomyMutationPatch(
      state,
      { storageLevel: 2, storedMicroTickets: 25_000_001 },
    );
    expect(expanded.storageLevel).toBe(2);
    expect(expanded.storedMicroTickets).toBe(25_000_001);
  });

  it("allows ticket inventory to decrease for future sale settlement", () => {
    const state = makeState({
      storedMicroTickets: 20_000_000,
    });

    const sold = applyStadiumEconomyMutationPatch(
      state,
      {
        storedMicroTickets: 5_000_000,
        saleRemainderMicrodollars: 75,
      },
    );

    expect(sold.storedMicroTickets).toBe(5_000_000);
    expect(sold.saleRemainderMicrodollars).toBe(75);
  });
});
