import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);
const fallbackCss = readFileSync(
  fileURLToPath(new URL("./scratch-result-fallback.css", import.meta.url)),
  "utf8",
);

describe("Standard 5 terminal artwork fallback", () => {
  it("loads after the visual lock so the terminal fallback wins the cascade", () => {
    expect(routeSource.indexOf('import "./scratch-result-fallback.css"')).toBeGreaterThan(
      routeSource.indexOf('import "./witch.visual-lock.css"'),
    );
  });

  it("paints the Danger artwork directly for every authoritative bomb marker", () => {
    expect(fallbackCss).toContain("PASS 48 — Standard 5 terminal artwork hard fallback");
    expect(fallbackCss).toContain('.witch-cell.is-bomb .witch-cell-result-layer');
    expect(fallbackCss).toContain('.witch-cell[data-cell-state="bomb"] .witch-cell-result-layer');
    expect(fallbackCss).toContain('.witch-cell[data-authoritative-result="BOMB"] .witch-cell-result-layer');
    expect(fallbackCss).toContain('background-image: url("/cadi-kazan/bcs-danger.webp") !important');
    expect(fallbackCss).toContain('[data-witch-result-candidate="BOMB"]');
    expect(fallbackCss).toContain("visibility: visible !important");
  });
});
