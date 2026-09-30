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
      artworkUrl: null,
    });
  });

  it("uses the Standard character artwork presentation after reveal", () => {
    expect(getScratchCellPresentation("STANDARD", true, true)).toEqual({
      symbol: "",
      label: "I AM THE DANGER",
      resultClass: "bomb",
      artworkUrl: "/cadi-kazan/bcs-danger.webp",
      artworkAlt: "I AM THE DANGER",
    });
    expect(getScratchCellPresentation("STANDARD", true, false)).toEqual({
      symbol: "",
      label: "SAUL GOODMAN",
      resultClass: "safe",
      artworkUrl: "/cadi-kazan/bcs-saul.webp",
      artworkAlt: "Saul Goodman",
    });
  });

  it("uses the supplied Advanced 25 paw and cat-skull artwork after reveal", () => {
    expect(getScratchCellPresentation("ADVANCED", true, true)).toEqual({
      symbol: "",
      label: "KEDİ KAFATASI · BOMBA",
      resultClass: "bomb",
      artworkUrl: "/cadi-kazan/advanced25-skull.webp",
      artworkAlt: "Kedi kafatası",
    });
    expect(getScratchCellPresentation("ADVANCED", true, false)).toEqual({
      symbol: "",
      label: "ALTIN PATİ",
      resultClass: "safe",
      artworkUrl: "/cadi-kazan/advanced25-paw.webp",
      artworkAlt: "Altın pati",
    });
  });
});
