import { describe, expect, it } from "vitest";
import {
  MILLISECONDS_PER_HOUR,
  calculateProducedMicroTickets,
  getStorageCapacityMicroTickets,
  getTicketProductionRateMicroTicketsPerHour,
  projectStadiumTicketProduction,
} from "./production";

describe("Stadium ticket production math", () => {
  it("produces exactly 2 tickets/hour for 1,000 seats at Speed Lv1", () => {
    expect(
      getTicketProductionRateMicroTicketsPerHour(1_000, 1),
    ).toBe(2_000_000);

    expect(
      calculateProducedMicroTickets(1_000, 1, MILLISECONDS_PER_HOUR),
    ).toBe(2_000_000);
  });

  it("preserves fractional ticket production as integer microtickets", () => {
    expect(
      calculateProducedMicroTickets(
        1,
        1,
        MILLISECONDS_PER_HOUR / 2,
      ),
    ).toBe(1_000);
  });

  it("reaches the accepted endgame rate at 500,000 seats and Speed Lv20", () => {
    expect(
      getTicketProductionRateMicroTicketsPerHour(500_000, 20),
    ).toBe(52_085_000_000);

    expect(
      calculateProducedMicroTickets(500_000, 20, MILLISECONDS_PER_HOUR),
    ).toBe(52_085_000_000);
  });

  it("converts Storage levels to exact microticket capacity", () => {
    expect(getStorageCapacityMicroTickets(1)).toBe(25_000_000);
    expect(getStorageCapacityMicroTickets(20)).toBe(500_000_000_000);
  });

  it("caps production at Storage capacity and marks Storage full", () => {
    const projection = projectStadiumTicketProduction({
      ownedSeats: 1_000,
      speedLevel: 1,
      storageLevel: 1,
      storedMicroTickets: 0,
      elapsedMs: 20 * MILLISECONDS_PER_HOUR,
    });

    expect(projection.productionRateMicroTicketsPerHour).toBe(2_000_000);
    expect(projection.creditedMicroTickets).toBe(25_000_000);
    expect(projection.liveStoredMicroTickets).toBe(25_000_000);
    expect(projection.remainingStorageMicroTickets).toBe(0);
    expect(projection.isStorageFull).toBe(true);
    expect(projection.productionStatus).toBe("STORAGE_FULL");
  });

  it("credits only the remaining free Storage when partially filled", () => {
    const projection = projectStadiumTicketProduction({
      ownedSeats: 1_000,
      speedLevel: 1,
      storageLevel: 1,
      storedMicroTickets: 24_500_000,
      elapsedMs: MILLISECONDS_PER_HOUR,
    });

    expect(projection.creditedMicroTickets).toBe(500_000);
    expect(projection.liveStoredMicroTickets).toBe(25_000_000);
    expect(projection.remainingStorageMicroTickets).toBe(0);
    expect(projection.isStorageFull).toBe(true);
  });

  it("does not produce with zero owned seats", () => {
    const projection = projectStadiumTicketProduction({
      ownedSeats: 0,
      speedLevel: 20,
      storageLevel: 20,
      storedMicroTickets: 0,
      elapsedMs: 10 * 24 * MILLISECONDS_PER_HOUR,
    });

    expect(projection.productionRateMicroTicketsPerHour).toBe(0);
    expect(projection.creditedMicroTickets).toBe(0);
    expect(projection.productionStatus).toBe("NO_SEATS");
  });

  it("handles very long offline intervals by capping before converting to number", () => {
    const projection = projectStadiumTicketProduction({
      ownedSeats: 500_000,
      speedLevel: 20,
      storageLevel: 20,
      storedMicroTickets: 0,
      // ~285 years: intentionally huge but still a safe integer millisecond value.
      elapsedMs: 9_000_000_000_000,
    });

    expect(projection.liveStoredMicroTickets).toBe(500_000_000_000);
    expect(projection.remainingStorageMicroTickets).toBe(0);
    expect(projection.isStorageFull).toBe(true);
    expect(projection.productionStatus).toBe("STORAGE_FULL");
  });

  it("rejects impossible stored inventory above the selected Storage capacity", () => {
    expect(() => projectStadiumTicketProduction({
      ownedSeats: 1_000,
      speedLevel: 1,
      storageLevel: 1,
      storedMicroTickets: 25_000_001,
      elapsedMs: 0,
    })).toThrow("IDLE_STORED_TICKETS_EXCEED_CAPACITY");
  });
});
