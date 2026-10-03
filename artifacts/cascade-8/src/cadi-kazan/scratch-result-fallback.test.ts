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

  it("paints Danger on the opaque visible content plane for every bomb marker", () => {
    expect(fallbackCss).toContain("PASS 49 — Standard 5 bomb artwork on the visible result plane");
    expect(fallbackCss).toContain('.witch-cell.is-bomb .witch-cell-content');
    expect(fallbackCss).toContain('.witch-cell[data-cell-state="bomb"] .witch-cell-content');
    expect(fallbackCss).toContain('.witch-cell[data-authoritative-result="BOMB"] .witch-cell-content');
    expect(fallbackCss).toContain('background-image: url("/cadi-kazan/bcs-danger.webp") !important');
    expect(fallbackCss).toContain('[data-witch-result-candidate="BOMB"]');
    expect(fallbackCss).toContain('[data-witch-result-candidate="SAFE"]');
    expect(fallbackCss).toContain("visibility: visible !important");
  });
});
