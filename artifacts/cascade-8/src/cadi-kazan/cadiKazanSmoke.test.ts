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
const scratchSurfaceSource = readFileSync(
  fileURLToPath(new URL("./scratch/ScratchSurface.ts", import.meta.url)),
  "utf8",
);
const audioManagerSource = readFileSync(
  fileURLToPath(new URL("./AudioManager.ts", import.meta.url)),
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


  it("keeps the Office reference card bounded inside the horizontal mobile stage", () => {
    expect(visualLockSource).toContain("height: min(100%, calc(var(--witch-vh) * 55))");
    expect(visualLockSource).toContain("max-width: 100%");
    expect(visualLockSource).toContain("aspect-ratio: 2.08 / 1");
  });


  it("clears legacy Office ticket offsets and keeps the purchased lacquer interactive", () => {
    expect(visualLockSource).toContain("PASS 14 — THE OFFICE table registration");
    expect(visualLockSource).toContain("top: auto !important");
    expect(visualLockSource).toContain("left: auto !important");
    expect(visualLockSource).toContain("transform: none !important");
    expect(visualLockSource).toContain(".witch-ticket:not(.is-preview) .witch-scratch-layer-lacquer");
    expect(visualLockSource).toContain("pointer-events: auto !important");
    expect(visualLockSource).toContain("touch-action: none !important");
  });


  it("prevents the generic safe sculpture from covering Office character art", () => {
    expect(visualLockSource).toContain("PASS 15 — THE OFFICE result artwork owns the full scratch cell");
    expect(visualLockSource).toContain(".witch-cell.is-office-cell .witch-cell-content::before");
    expect(visualLockSource).toContain("content: none !important");
    expect(visualLockSource).toContain(".witch-cell.is-office-cell .witch-cell-aura");
    expect(visualLockSource).toContain("object-fit: contain !important");
  });


  it("shows stake-derived Office prize money instead of multiplier labels", () => {
    expect(witchClientSource).toContain("symbolPrizeCents");
    expect(witchClientSource).toContain("round.stakeCents * symbol.multiplierBps");
    expect(witchClientSource).toContain('formatMoney(symbolPrizeCents, { compactInteger: true })');
    expect(witchClientSource).toContain("witch-office-result-prize");
    expect(witchClientSource).not.toContain('<strong class="witch-office-result-name">');
    expect(visualLockSource).toContain("PASS 16 — THE OFFICE smaller character art + direct prize amount");
    expect(visualLockSource).toContain("width: 84.6% !important");
    expect(visualLockSource).toContain("height: 84.6% !important");
    expect(visualLockSource).toContain(".witch-office-result-name");
    expect(visualLockSource).toContain("display: none !important");
  });


  it("uses a 30 percent larger scratch brush only for The Office", () => {
    expect(witchClientSource).toContain("const SCRATCH_BRUSH_RADIUS_PX = 14;");
    expect(witchClientSource).toContain("const OFFICE_SCRATCH_BRUSH_RADIUS_PX = SCRATCH_BRUSH_RADIUS_PX * 1.43;");
    expect(witchClientSource).toContain('brushRadiusPx: round.mode === "OFFICE_MATCH_6" ? OFFICE_SCRATCH_BRUSH_RADIUS_PX : SCRATCH_BRUSH_RADIUS_PX');
  });


  it("keeps Office reveal cells white and routes one drag across multiple cells", () => {
    expect(visualLockSource).toContain("PASS 17 — THE OFFICE white reveal stage");
    expect(visualLockSource).toContain(".witch-cell.is-office-cell .witch-office-result-art");
    expect(visualLockSource).toContain("background: #fff !important");
    expect(witchClientSource).toContain("officeScratchPointerId");
    expect(witchClientSource).toContain("officeScratchOriginIndex");
    expect(witchClientSource).toContain("surface.scratchExternalPointer");
    expect(witchClientSource).toContain("surface.finishExternalPointer");
    expect(scratchSurfaceSource).toContain("scratchExternalPointer(");
    expect(scratchSurfaceSource).toContain("finishExternalPointer(");
  });

  it("plays a negative cue only when an Office card completes with no prize", () => {
    expect(audioManagerSource).toContain("officeLoss()");
    expect(witchClientSource).toContain('resultRound?.mode === "OFFICE_MATCH_6" && resultRound.payoutCents === 0');
    expect(witchClientSource).toContain("this.audio.officeLoss()");
    expect(witchClientSource).toContain("else this.audio.cashRegister()");
  });


  it("removes the near-black matte around Office cutouts", () => {
    expect(witchClientSource).toContain('id="witch-office-remove-black"');
    expect(witchClientSource).toContain("8 8 8 0 -0.12");
    expect(visualLockSource).toContain("PASS 18 — THE OFFICE supplied character cutouts on white");
    expect(visualLockSource).toContain("filter: url(#witch-office-remove-black) !important");
    expect(visualLockSource).toContain("background: transparent !important");
  });


  it("uses the master PNG as the Office card and pins all six live scratch zones to measured coordinates", () => {
    expect(witchClientSource).toContain("OFFICE_CARD_ART_URL");
    expect(witchClientSource).toContain("witch-office-card-master");
    expect(witchClientSource).toContain('width="1511" height="707"');
    expect(witchClientSource).toContain('loading="eager"');
    expect(witchClientSource).toContain('decoding="async"');
    expect(witchClientSource).toContain("background-image:url('${OFFICE_CARD_ART_URL}')");
    expect(visualLockSource).toContain("PASS 20 — THE OFFICE full-PNG hard lock");
    expect(visualLockSource).toContain("background-size: 100% 100% !important");
    expect(visualLockSource).toContain(".is-office-theme .witch-ticket::after");
    expect(visualLockSource).toContain("PASS 19 — THE OFFICE master-PNG shell");
    expect(visualLockSource).toContain("aspect-ratio: 1511 / 707");
    expect(visualLockSource).toContain("left: 37.2601% !important");
    expect(visualLockSource).toContain("top: 13.2956% !important");
    expect(visualLockSource).toContain("right: 4.6989% !important");
    expect(visualLockSource).toContain("bottom: 8.9109% !important");
    expect(visualLockSource).toContain(".witch-board > .witch-cell:nth-child(1)");
    expect(visualLockSource).toContain(".witch-board > .witch-cell:nth-child(6)");
    expect(visualLockSource).toContain("overflow: hidden !important");
    expect(visualLockSource).toContain(".witch-ticket.is-preview .witch-office-preview-coating");
  });

});
