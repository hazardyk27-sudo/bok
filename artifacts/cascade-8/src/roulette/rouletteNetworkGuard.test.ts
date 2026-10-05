import { describe, expect, it } from "vitest";
import {
  ROULETTE_MUTATION_HARD_TIMEOUT_MS,
  ROULETTE_STATE_HARD_TIMEOUT_MS,
  getRouletteRequestTimeoutMs,
} from "./rouletteNetworkGuard";

describe("roulette network guard", () => {
  it("bounds authoritative state reads", () => {
    expect(
      getRouletteRequestTimeoutMs(
        "/api/roulette/state",
      ),
    ).toBe(ROULETTE_STATE_HARD_TIMEOUT_MS);
  });

  it("bounds global bet mutations more aggressively than the legacy 8s client timeout", () => {
    expect(
      getRouletteRequestTimeoutMs(
        "/api/roulette/global-bets",
        { method: "PUT" },
      ),
    ).toBe(ROULETTE_MUTATION_HARD_TIMEOUT_MS);
    expect(ROULETTE_MUTATION_HARD_TIMEOUT_MS).toBeLessThan(8_000);
  });

  it("does not touch unrelated requests or wrong methods", () => {
    expect(
      getRouletteRequestTimeoutMs(
        "/api/roulette/global-bets",
        { method: "GET" },
      ),
    ).toBeNull();
    expect(
      getRouletteRequestTimeoutMs(
        "/api/slot/state",
      ),
    ).toBeNull();
  });
});
