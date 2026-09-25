import { describe, expect, it } from "vitest";
import { getScratchCellLayerMarkup, getScratchCellPresentation } from "./ScratchPresentation";

describe("scratch result presentation", () => {
  it("places the result layer directly below the scratch mask", () => {
    const markup = getScratchCellLayerMarkup();

    expect(markup.indexOf("witch-cell-result-layer")).toBeGreaterThanOrEqual(0);
    expect(markup.indexOf("witch-scratch-layer-base")).toBeGreaterThan(markup.indexOf("witch-cell-result-layer"));
    expect(markup.indexOf("witch-scratch-layer-foil")).toBeGreaterThan(markup.indexOf("witch-scratch-layer-base"));
    expect(markup.indexOf("witch-scratch-layer-lacquer")).toBeGreaterThan(markup.indexOf("witch-scratch-layer-foil"));
    expect(markup).not.toContain("data-witch-cell");
  });

  it("does not expose a result before the server commits the cell", () => {
    expect(getScratchCellPresentation("STANDARD", false, false)).toEqual({
      symbol: "",
      label: "",
      resultClass: null,
    });
  });

  it("uses the shared bomb presentation for both modes", () => {
    expect(getScratchCellPresentation("STANDARD", true, true)).toEqual({
      symbol: "●",
      label: "BOMBA",
      resultClass: "bomb",
    });
    expect(getScratchCellPresentation("ADVANCED", true, true)).toEqual({
      symbol: "●",
      label: "BOMBA",
      resultClass: "bomb",
    });
  });

  it("uses a premium gold lucky symbol for safe cells", () => {
    expect(getScratchCellPresentation("ADVANCED", true, false)).toEqual({
      symbol: "✦",
      label: "ALTIN",
      resultClass: "safe",
    });
  });
});
