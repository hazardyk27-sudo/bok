import { describe, expect, it } from "vitest";
import { getScratchCellPresentation } from "./ScratchPresentation";

describe("scratch result presentation", () => {
  it("does not expose a cell index for an unrevealed surface", () => {
    expect(getScratchCellPresentation("STANDARD", false, false)).toEqual({
      symbol: "",
      label: "",
      resultClass: null,
    });
  });

  it("uses an obvious bomb result for Standard", () => {
    expect(getScratchCellPresentation("STANDARD", true, true)).toEqual({
      symbol: "💣",
      label: "BOMBA",
      resultClass: "bomb",
    });
  });

  it("uses an alarm result for Advanced and a gold result for safe cells", () => {
    expect(getScratchCellPresentation("ADVANCED", true, true)).toEqual({
      symbol: "⚠",
      label: "ALARM",
      resultClass: "bomb",
    });
    expect(getScratchCellPresentation("ADVANCED", true, false)).toEqual({
      symbol: "✦",
      label: "GOLD",
      resultClass: "safe",
    });
  });
});