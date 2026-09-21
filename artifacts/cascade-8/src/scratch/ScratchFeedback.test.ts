import { describe, expect, it } from "vitest";
import { getScratchHapticPattern } from "./ScratchFeedback";

describe("scratch tactile feedback", () => {
  it("keeps distinct short patterns for the important result events", () => {
    expect(getScratchHapticPattern("GOLD")).toBe(18);
    expect(getScratchHapticPattern("BOMB")).toEqual([36, 24, 72]);
    expect(getScratchHapticPattern("BOMB")).toEqual([36, 24, 72]);
    expect(getScratchHapticPattern("CASH_OUT")).toEqual([18, 28, 46]);
  });
});