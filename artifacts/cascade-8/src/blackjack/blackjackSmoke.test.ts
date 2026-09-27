import { describe, expect, it } from "vitest";
import {
  BLACKJACK_MAX_SEATS,
  BLACKJACK_ROUTE,
  BLACKJACK_SHELL_MARKUP,
} from "./index";

describe("blackjack foundation contract", () => {
  it("owns the canonical Blackjack route identifier", () => {
    expect(BLACKJACK_ROUTE).toBe("/blackjack");
  });

  it("declares exactly five player seats for the table foundation", () => {
    expect(BLACKJACK_MAX_SEATS).toBe(5);
    for (let seat = 1; seat <= BLACKJACK_MAX_SEATS; seat += 1) {
      expect(BLACKJACK_SHELL_MARKUP).toContain(`SEAT ${seat}`);
    }
  });

  it("keeps the shell explicitly marked as Blackjack-owned foundation UI", () => {
    expect(BLACKJACK_SHELL_MARKUP).toContain('data-game="blackjack"');
    expect(BLACKJACK_SHELL_MARKUP).toContain('data-phase="foundation"');
  });
});
