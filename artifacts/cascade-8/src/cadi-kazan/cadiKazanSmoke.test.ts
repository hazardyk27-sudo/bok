import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cadiRouteSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);
const witchClientSource = readFileSync(
  fileURLToPath(new URL("./witchClient.ts", import.meta.url)),
  "utf8",
);
const visualLockSource = readFileSync(
  fileURLToPath(new URL("./witch.visual-lock.css", import.meta.url)),
  "utf8",
);

describe("cadi kazan route smoke contract", () => {
  it("keeps Cadı Kazan fully mounted inside its owned route module", () => {
    expect(cadiRouteSource).toContain(
      "export function mountCadiKazan(app: HTMLElement)",
    );
    expect(cadiRouteSource).toContain(
      "app.innerHTML = cadiKazanRouteShell(CADI_KAZAN_MARKUP);",
    );
    expect(witchClientSource).toContain('<main class="witch-page"');
  });

  it("keeps critical Cadı Kazan markup anchors", () => {
    const requiredAnchors = [
      "data-witch-balance",
      "data-witch-round",
      "data-witch-round-status",
      "data-witch-ticket",
      'data-witch-mode="STANDARD"',
      'data-witch-mode="ADVANCED"',
      'data-witch-mode="OFFICE_MATCH_6"',
      'data-witch-action="start"',
      'data-witch-action="cashout"',
      "data-witch-feedback",
      "data-witch-mobile-actions",
    ];

    for (const anchor of requiredAnchors) {
      expect(witchClientSource).toContain(anchor);
    }
  });

  it("mounts WitchClient from the Cadı Kazan-owned module", () => {
    expect(cadiRouteSource).toContain(
      'const witchRoot = app.querySelector<HTMLElement>(".witch-page");',
    );
    expect(cadiRouteSource).toContain(
      "if (witchRoot) new WitchClient(witchRoot);",
    );
    expect(witchClientSource).toContain("export class WitchClient");
    expect(witchClientSource).toContain('const API_BASE = "/api/cadi-kazan";');
  });

  it("owns its audio dependency instead of importing Slot audio", () => {
    expect(witchClientSource).toContain('from "./AudioManager"');
    expect(witchClientSource).not.toContain('from "./game/AudioManager"');
  });

  it("keeps The Office six-cell card wired into the selector and scratch scaffold", () => {
    expect(witchClientSource).toContain('data-witch-mode="OFFICE_MATCH_6"');
    expect(witchClientSource).toContain("The Office");
    expect(witchClientSource).toContain("3 AYNI");
    expect(witchClientSource).toContain("Array.from({ length: 6 }");
    expect(witchClientSource).toContain("revealedOfficeCells");
    expect(witchClientSource).toContain("officeSymbolPresentation");
    expect(witchClientSource).toContain("witch-office-result-art");
    expect(witchClientSource).toContain("officePresentation.artworkUrl");
  });


  it("uses the supplied Office sticker language for preview and live scratch coating", () => {
    expect(witchClientSource).toContain("OFFICE_SCRATCH_COVER_URL");
    expect(witchClientSource).toContain("that's");
    expect(witchClientSource).toContain("what");
    expect(witchClientSource).toContain("she said");
    expect(witchClientSource).toContain("round.mode === \"OFFICE_MATCH_6\"");
    expect(witchClientSource).toContain("? OFFICE_SCRATCH_COVER_URL");
  });

  it("locks The Office ticket to the supplied black 3x2 reference composition", () => {
    expect(visualLockSource).toContain("PASS 12 — THE OFFICE reference-fit ticket");
    expect(visualLockSource).toContain("aspect-ratio: 2.08 / 1");
    expect(visualLockSource).toContain("grid-template-columns: repeat(3");
    expect(visualLockSource).toContain("grid-template-rows: repeat(2");
  });


  it("highlights only the resolved Office winning triple and reserves the premium effect for Michael 100x", () => {
    expect(witchClientSource).toContain("winningOfficeSymbolId");
    expect(witchClientSource).toContain("is-office-winning-match");
    expect(witchClientSource).toContain('winningOfficeSymbolId === "MICHAEL"');
    expect(visualLockSource).toContain("PASS 13 — THE OFFICE matched-triple win emphasis");
    expect(visualLockSource).toContain("witch-office-100x-pulse");
    expect(visualLockSource).toContain("prefers-reduced-motion: no-preference");
  });

});
