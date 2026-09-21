import { describe, expect, it } from "vitest";
import { getScratchCellLayerMarkup, getScratchCellPresentation } from "./ScratchPresentation";

describe("scratch result presentation", () => {
  it("places the result layer directly below the scratch mask", () => {
    const markup = getScratchCellLayerMarkup();

    expect(markup.indexOf("witch-cell-result-layer")).toBeGreaterThanOrEqual(0);
    expect(markup.indexOf("witch-scratch-canvas")).toBeGreaterThan(markup.indexOf("witch-cell-result-layer"));
    expect(markup).not.toContain("data-witch-cell");
  });

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

  it("uses the shared bomb result for both modes and a gold result for safe cells", () => {
    expect(getScratchCellPresentation("ADVANCED", true, true)).toEqual({
      symbol: "💣",
      label: "BOMBA",
      resultClass: "bomb",
    });
    expect(getScratchCellPresentation("ADVANCED", true, false)).toEqual({
      symbol: "✦",
      label: "GOLD",
      resultClass: "safe",
    });
  });
});