import { describe, expect, it } from "vitest";
import { blackjackResultFallbackDelayMs } from "./roundResultOverlay";

describe("Blackjack round result reveal timing", () => {
  it("waits through dealer reveal and scales for extra dealer draws", () => {
    expect(blackjackResultFallbackDelayMs(2)).toBe(1700);
    expect(blackjackResultFallbackDelayMs(3)).toBe(2500);
    expect(blackjackResultFallbackDelayMs(4)).toBe(3300);
  });

  it("normalizes invalid or too-small dealer card counts", () => {
    expect(blackjackResultFallbackDelayMs(0)).toBe(1700);
    expect(blackjackResultFallbackDelayMs(Number.NaN)).toBe(1700);
  });
});
