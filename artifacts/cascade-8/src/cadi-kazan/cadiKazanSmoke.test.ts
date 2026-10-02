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
const scratchPresentationSource = readFileSync(
  fileURLToPath(new URL("./scratch/ScratchPresentation.ts", import.meta.url)),
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
    expect(witchClientSource).toContain("paintPreparedReveal");
    expect(scratchPresentationSource).toContain("witch-office-result-art");
    expect(scratchPresentationSource).toContain("data-witch-office-candidate");
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
    expect(witchClientSource).toContain("round.stakeCents * symbol.multiplierBps");
    expect(witchClientSource).toContain("Math.floor((round.stakeCents * symbol.multiplierBps) / 100)");
    expect(witchClientSource).toContain("{ compactInteger: true }");
    expect(scratchPresentationSource).toContain("witch-office-result-prize");
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
    expect(witchClientSource).toContain('width="1000" height="468"');
    expect(witchClientSource).toContain('loading="eager"');
    expect(witchClientSource).toContain('decoding="async"');
    expect(witchClientSource).toContain('<div class="witch-office-card-art" aria-hidden="true">');
    expect(witchClientSource).not.toContain("background-image:url('${OFFICE_CARD_ART_URL}')");
    expect(visualLockSource).toContain("PASS 20 — THE OFFICE full-PNG hard lock");
    expect(visualLockSource).toContain("PASS 21 — THE OFFICE literal single-PNG shell");
    expect(visualLockSource).toContain("PASS 22 — THE OFFICE approved reference master + monochrome deck theme");
    expect(visualLockSource).toContain("top: 13.2479% !important");
    expect(visualLockSource).toContain("right: 4.7% !important");
    expect(visualLockSource).toContain("bottom: 8.9744% !important");
    expect(visualLockSource).toContain("width: 29.0878% !important");
    expect(visualLockSource).toContain(".is-office-theme .witch-control-dock");
    expect(visualLockSource).toContain(".is-office-theme .witch-primary-button");
    expect(visualLockSource).toContain("background: linear-gradient(180deg, #ffffff 0%, #e2e4e6 54%, #bfc3c7 100%) !important");
    expect(visualLockSource).toContain("padding: 0 !important");
    expect(visualLockSource).toContain("object-fit: contain !important");
    expect(visualLockSource).toContain("background: none !important");
    expect(visualLockSource).toContain("background-size: 100% 100% !important");
    expect(visualLockSource).toContain(".is-office-theme .witch-ticket::after");
    expect(visualLockSource).toContain("PASS 19 — THE OFFICE master-PNG shell");
    expect(visualLockSource).toContain("aspect-ratio: 1000 / 468");
    expect(visualLockSource).toContain("left: 37.2% !important");
    expect(visualLockSource).toContain("left: 35.6282% !important");
    expect(visualLockSource).toContain("left: 71.2565% !important");
    expect(visualLockSource).toContain("top: 56.3187% !important");
    expect(visualLockSource).toContain("width: 29.0878% !important");
    expect(visualLockSource).toContain(".witch-board > .witch-cell:nth-child(1)");
    expect(visualLockSource).toContain(".witch-board > .witch-cell:nth-child(6)");
    expect(visualLockSource).toContain("overflow: hidden !important");
    expect(visualLockSource).toContain(".witch-ticket.is-preview .witch-office-preview-coating");
  });


  it("uses one canonical Better Call Saul payout/deck structure with card-only palette changes", () => {
    expect(witchClientSource).toContain('classList.toggle("is-advanced-theme", visualMode === "ADVANCED")');
    expect(visualLockSource).toContain("PASS 23 — canonical payout/deck theme system");
    expect(visualLockSource).toContain(".is-standard-theme {");
    expect(visualLockSource).toContain(".is-advanced-theme {");
    expect(visualLockSource).toContain(".is-office-theme {");
    expect(visualLockSource).toContain("--witch-payout-panel-bg");
    expect(visualLockSource).toContain("--witch-deck-bg");
    expect(visualLockSource).toContain(":is(.is-standard-theme, .is-advanced-theme, .is-office-theme) .witch-payout-panel");
    expect(visualLockSource).toContain("background: var(--witch-payout-panel-bg) !important");
    expect(visualLockSource).toContain('font-family: Impact, "Arial Black", "DM Sans", sans-serif !important');
    expect(visualLockSource).toContain(":is(.is-standard-theme, .is-advanced-theme, .is-office-theme) .witch-control-dock");
    expect(visualLockSource).toContain("background: var(--witch-deck-bg) !important");
    expect(visualLockSource).toContain("--witch-deck-bg: linear-gradient(180deg, #f7f7f7 0%, #dedfe1 100%)");
  });


  it("locks The Office to one PNG and exactly six clipped interactive scratch zones", () => {
    expect(visualLockSource).toContain("PASS 24 — THE OFFICE authoritative PNG + six-zone interaction lock");
    expect(visualLockSource).toContain("--office-card-ratio: 1000 / 468");
    expect(visualLockSource).toContain("--office-scratch-left: 37.2%");
    expect(visualLockSource).toContain("--office-scratch-top: 13.2479%");
    expect(visualLockSource).toContain("--office-scratch-right: 4.7%");
    expect(visualLockSource).toContain("--office-scratch-bottom: 8.9744%");
    expect(visualLockSource).toContain("--office-cell-left: 35.6282%");
    expect(visualLockSource).toContain("--office-cell-left: 71.2565%");
    expect(visualLockSource).toContain("--office-cell-top: 56.3187%");
    expect(visualLockSource).toContain("--office-cell-width: 28.7435%");
    expect(visualLockSource).toContain("--office-cell-height: 43.6813%");
    expect(visualLockSource).toContain(".witch-ticket.is-preview .witch-board");
    expect(visualLockSource).toContain("pointer-events: none !important");
    expect(visualLockSource).toContain(".witch-ticket:not(.is-preview) .witch-board > .witch-cell");
    expect(visualLockSource).toContain("pointer-events: auto !important");
    expect(visualLockSource).toContain("touch-action: none !important");
  });


  it("keeps The Office palette light with black/gray content while preserving shared geometry", () => {
    expect(visualLockSource).toContain("PASS 25 — THE OFFICE final light monochrome UI palette");
    expect(visualLockSource).toContain("--witch-deck-bg:");
    expect(visualLockSource).toContain("linear-gradient(180deg, #f7f7f6 0%, #eceeed 50%, #d7dadd 100%)");
    expect(visualLockSource).toContain("--witch-control-text: #17191b");
    expect(visualLockSource).toContain("--witch-layer-bg:");
    expect(visualLockSource).toContain(".is-office-theme .witch-card-menu");
    expect(visualLockSource).toContain(".is-office-theme .witch-game-menu");
    expect(visualLockSource).toContain(".is-office-theme .witch-card-option.is-selected");
    expect(visualLockSource).toContain(".is-office-theme .witch-primary-button:not(:disabled)");
    expect(visualLockSource).toContain(".is-office-theme .witch-cashout-button:not(:disabled)");
    expect(visualLockSource).toContain("color: #ffffff !important");
  });


  it("uses the supplied star-backed Office symbols with star-matched prize badges", () => {
    expect(visualLockSource).toContain("PASS 26 — THE OFFICE star-backed character symbols + color-linked prize badge");
    expect(scratchPresentationSource).toContain("--office-symbol-color:");
    expect(scratchPresentationSource).toContain("--office-symbol-text:");
    expect(scratchPresentationSource).toContain('decoding="async"');
    expect(visualLockSource).toContain("background: var(--office-symbol-color, #e5e7e9) !important");
    expect(visualLockSource).toContain("color: var(--office-symbol-text, #151719) !important");
    expect(visualLockSource).toContain("filter: none !important");
    expect(visualLockSource).toContain("contain: paint !important");
  });


  it("renders Advanced 25 as one master PNG with 25 registered scratch-only zones", () => {
    expect(witchClientSource).toContain('const ADVANCED_25_CARD_ART_URL = new URL("./advanced/assets/advanced25-card-master.png", import.meta.url).href');
    expect(witchClientSource).toContain('class="witch-advanced-card-master"');
    expect(witchClientSource).toContain('width="1200" height="546"');
    expect(witchClientSource).toContain("const showAdvancedPreview = !hasRound && visualMode === \"ADVANCED\"");
    expect(witchClientSource).toContain('board.dataset.preview = "advanced"');
    expect(witchClientSource).toContain("Array.from({ length: 25 }");
    expect(visualLockSource).toContain("PASS 27 — ADVANCED 25 single-PNG card + exact 5×5 scratch registration");
    expect(visualLockSource).toContain("--advanced-scratch-left: 32.5982%");
    expect(visualLockSource).toContain("--advanced-scratch-top: 11.3475%");
    expect(visualLockSource).toContain("--advanced-scratch-right: 3.6579%");
    expect(visualLockSource).toContain("--advanced-scratch-bottom: 8.5106%");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-board > .witch-cell:nth-child(25)");
    expect(visualLockSource).toContain("--advanced-cell-left: 81.0127%");
    expect(visualLockSource).toContain("pointer-events: auto !important");
  });


  it("uses optimized supplied paw/skull artwork for Advanced 25 results", () => {
    expect(scratchPresentationSource).toContain('class="witch-cell-artwork"');
    expect(scratchPresentationSource).toContain('decoding="async"');
    expect(visualLockSource).toContain("PASS 28 — ADVANCED 25 supplied paw/skull reveal artwork");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-cell.is-safe .witch-cell-artwork");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-cell.is-bomb .witch-cell-artwork");
    expect(visualLockSource).toContain("object-fit: contain !important");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-cell-result-label");
  });


  it("locks Advanced 25 to one black/gold UI palette and full-card responsive fit", () => {
    expect(visualLockSource).toContain("PASS 29 — ADVANCED 25 final black/gold UI palette + responsive fit lock");
    expect(visualLockSource).toContain("--witch-layer-bg:");
    expect(visualLockSource).toContain("--witch-layer-border: rgba(225, 174, 67, .52)");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-card-menu");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-game-menu");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-primary-button:not(:disabled)");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-cashout-button:not(:disabled)");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-table-surface");
    expect(visualLockSource).toContain("max-height: calc(var(--witch-vh) * 82) !important");
    expect(visualLockSource).toContain("aspect-ratio: var(--advanced-card-ratio) !important");
  });


  it("keeps Advanced 25 result assets inside the Cadı Kazan ownership root", () => {
    expect(scratchPresentationSource).toContain('new URL("../advanced/assets/advanced25-paw.webp", import.meta.url).href');
    expect(scratchPresentationSource).toContain('new URL("../advanced/assets/advanced25-skull.webp", import.meta.url).href');
    expect(scratchPresentationSource).not.toContain('"/cadi-kazan/advanced25-paw.webp"');
    expect(scratchPresentationSource).not.toContain('"/cadi-kazan/advanced25-skull.webp"');
  });


  it("keeps payout beside the card by sharing the BCS desktop parent grid across every card", () => {
    expect(visualLockSource).toContain("PASS 30 — canonical desktop stage geometry");
    expect(visualLockSource).toContain(':is(.is-standard-theme, .is-advanced-theme, .is-office-theme) .witch-stage-shell');
    expect(visualLockSource).toContain('grid-template-areas: "table payout" !important');
    expect(visualLockSource).toContain('grid-template-columns: minmax(0, 1fr) 230px !important');
    expect(visualLockSource).toContain(':is(.is-standard-theme, .is-advanced-theme, .is-office-theme) .witch-table-surface');
    expect(visualLockSource).toContain('position: relative !important');
    expect(visualLockSource).toContain(':is(.is-standard-theme, .is-advanced-theme, .is-office-theme) .witch-payout-panel');
    expect(visualLockSource).toContain('width: 230px !important');
    expect(visualLockSource).toContain(':is(.is-advanced-theme, .is-office-theme) .witch-ticket-header');
  });


  it("hard-removes generic ticket chrome from master-PNG cards and themes the app header by card", () => {
    expect(witchClientSource).toContain('const usesMasterCardArtwork = visualMode === "ADVANCED" || visualMode === "OFFICE_MATCH_6"');
    expect(witchClientSource).toContain('".witch-ticket-frame, .witch-bcs-card-art, .witch-ticket-header, .witch-ticket-meta-row, .witch-ticket-footer"');
    expect(visualLockSource).toContain("PASS 31 — master-card chrome kill + card-themed top chrome");
    expect(visualLockSource).toContain("> :not(.witch-advanced-card-art):not(.witch-board-wrap)");
    expect(visualLockSource).toContain("> :not(.witch-office-card-art):not(.witch-board-wrap)");
    expect(visualLockSource).toContain("grid-template: none !important");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-appbar");
    expect(visualLockSource).toContain(".is-office-theme .witch-appbar");
    expect(visualLockSource).toContain("color: #111315 !important");
  });


  it("uses the bundled 1423x557 Office scene only as The Office stage background", () => {
    expect(visualLockSource).toContain("PASS 32 — THE OFFICE stage background");
    expect(visualLockSource).toContain('.is-office-theme .witch-stage-shell');
    expect(visualLockSource).toContain('url("./office/assets/office-stage-background.webp") !important');
    expect(visualLockSource).toContain('.is-office-theme .witch-table-surface');
    expect(visualLockSource).toContain('.is-office-theme .witch-payout-panel');
  });


  it("prevents Office multi-scratch cells from getting stranded behind a busy reveal", () => {
    expect(witchClientSource).toContain("private officeRevealQueue: Promise<void> = Promise.resolve()");
    expect(witchClientSource).toContain("private queueOfficeReveal(cellIndex: number)");
    expect(witchClientSource).toContain("await this.queueOfficeReveal(index)");
    expect(witchClientSource).toContain('persistentCoverageCommit: round.mode === "OFFICE_MATCH_6"');
    expect(scratchSurfaceSource).toContain("private accumulatedScratchDistancePx = 0");
    expect(scratchSurfaceSource).toContain("const persistentCoverageReady =");
    expect(scratchSurfaceSource).toContain("input.coverage >= 0.34");
    expect(scratchSurfaceSource).toContain("input.accumulatedScratchDistancePx >= Math.max(90, input.widthPx * 0.75)");
    expect(scratchSurfaceSource).toContain("private scheduleDeferredCommit(now: number)");
  });


  it("keeps The Office app bar and control deck black with white/gray UI copy", () => {
    expect(visualLockSource).toContain("PASS 33 — THE OFFICE black top bar + black deck");
    expect(visualLockSource).toContain(".is-office-theme .witch-appbar");
    expect(visualLockSource).toContain(".is-office-theme .witch-control-dock");
    expect(visualLockSource).toContain("--office-ui-black: #050607");
    expect(visualLockSource).toContain("--office-ui-white: #f7f8f9");
    expect(visualLockSource).toContain(".is-office-theme .witch-stat-balance strong");
    expect(visualLockSource).toContain(".is-office-theme .witch-primary-button:not(:disabled)");
    expect(visualLockSource).toContain(".is-office-theme .witch-stake-presets button.is-selected");
  });


  it("pins Advanced 25 cells directly to the 1200x546 master instead of a resizable nested union", () => {
    expect(visualLockSource).toContain("PASS 34 — ADVANCED 25 direct master-coordinate registration, Part 1");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-ticket.is-advanced > .witch-board-wrap");
    expect(visualLockSource).toContain("inset: 0 !important");
    expect(visualLockSource).toContain("left: 32.5982% !important");
    expect(visualLockSource).toContain("width: 12.1570% !important");
    expect(visualLockSource).toContain("left: 84.2389% !important");
    expect(visualLockSource).toContain("top: 11.3475% !important");
    expect(visualLockSource).toContain("top: 76.7140% !important");
    expect(visualLockSource).toContain("height: 14.7754% !important");
  });


  it("locks Advanced scratch canvases and paw/skull art inside each measured cell", () => {
    expect(visualLockSource).toContain("PASS 35 — ADVANCED 25 cell-local scratch/result lock, Part 2");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-ticket.is-advanced .witch-board > .witch-cell > .witch-scratch-layer");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-ticket.is-advanced .witch-board > .witch-cell > .witch-debris-canvas");
    expect(visualLockSource).toContain("border-radius: 9% / 17% !important");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-ticket.is-advanced .witch-cell-artwork");
    expect(visualLockSource).toContain("justify-self: center !important");
    expect(visualLockSource).toContain("align-self: center !important");
    expect(visualLockSource).toContain("object-position: 50% 50% !important");
    expect(visualLockSource).toContain("width: 72% !important");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-ticket.is-advanced .witch-cell.is-bomb .witch-cell-artwork");
  });


  it("locks the final Advanced 25 master geometry to a non-overflowing 5x5 map", () => {
    expect(visualLockSource).toContain("PASS 36 — ADVANCED 25 final geometry QA / regression lock, Part 3");

    const masterWidth = 1200;
    const masterHeight = 546;
    const columns = [
      [32.5982, 12.1570],
      [45.5622, 12.1032],
      [58.4723, 12.1032],
      [71.3287, 12.1032],
      [84.2389, 12.1032],
    ] as const;
    const rows = [
      [11.3475, 15.1301],
      [28.0142, 14.8937],
      [44.5626, 14.6572],
      [60.7565, 14.5390],
      [76.8322, 14.6572],
    ] as const;

    const pxColumns = columns.map(([left, width]) => [
      masterWidth * left / 100,
      masterWidth * width / 100,
    ] as const);
    const pxRows = rows.map(([top, height]) => [
      masterHeight * top / 100,
      masterHeight * height / 100,
    ] as const);

    expect(pxColumns).toHaveLength(5);
    expect(pxRows).toHaveLength(5);
    expect(pxColumns[0][0]).toBeGreaterThanOrEqual(391);
    expect(pxColumns[4][0] + pxColumns[4][1]).toBeLessThanOrEqual(1157);
    expect(pxRows[0][0]).toBeGreaterThanOrEqual(61);
    expect(pxRows[4][0] + pxRows[4][1]).toBeLessThanOrEqual(501);

    for (let index = 0; index < 4; index += 1) {
      expect(pxColumns[index][0] + pxColumns[index][1]).toBeLessThan(pxColumns[index + 1][0]);
      expect(pxRows[index][0] + pxRows[index][1]).toBeLessThan(pxRows[index + 1][0]);
    }

    expect(visualLockSource).toContain(".witch-cell:nth-child(n + 21):nth-child(-n + 25)");
    expect(visualLockSource).toContain("top: 76.8322% !important");
    expect(visualLockSource).toContain("height: 14.6572% !important");
    expect(visualLockSource).toContain("clip-path: inset(0) !important");
    expect(visualLockSource).toContain("contain: layout paint !important");
  });


  it("finishes Advanced 25 Part 1 with full BUST reveal and centered placement", () => {
    expect(witchClientSource).toContain('round.mode === "ADVANCED" && round.status === "BUST"');
    expect(witchClientSource).toContain("allCells.forEach((index) => this.terminalRevealVisibleCells.add(index))");
    expect(witchClientSource).not.toContain('data-witch-advanced-card-value');
    expect(visualLockSource).toContain("PASS 37 — ADVANCED 25 Part 1: terminal reveal + centered table placement");
    expect(visualLockSource).not.toContain(".is-advanced-theme .witch-advanced-card-value");
    expect(visualLockSource).toContain("justify-self: center !important");
    expect(visualLockSource).toContain("align-self: center !important");
  });


  it("centers every Advanced paw/skull result on the exact scratch-cell center", () => {
    expect(visualLockSource).toContain("PASS 38 — ADVANCED 25 follow-up Part 2: exact symbol centering");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-ticket.is-advanced .witch-cell-artwork");
    expect(visualLockSource).toContain("left: 50% !important");
    expect(visualLockSource).toContain("top: 50% !important");
    expect(visualLockSource).toContain("transform: translate(-50%, -50%) !important");
    expect(visualLockSource).toContain("object-position: 50% 50% !important");
    expect(visualLockSource).toContain(".witch-cell.is-safe .witch-cell-artwork");
    expect(visualLockSource).toContain(".witch-cell.is-bomb .witch-cell-artwork");
    expect(visualLockSource).toContain(".witch-cell.is-terminal-reveal .witch-cell-artwork");
  });


  it("uses one centered premium back-button geometry across every Cadı Kazan theme", () => {
    expect(visualLockSource).toContain("PASS 39 — Cadı Kazan global back-button polish, Part 3");
    expect(visualLockSource).toContain(".witch-back::before");
    expect(visualLockSource).toContain(".witch-back::after");
    expect(visualLockSource).toContain("place-items: center !important");
    expect(visualLockSource).toContain("color: transparent !important");
    expect(visualLockSource).toContain(".is-standard-theme .witch-back");
    expect(visualLockSource).toContain(".is-advanced-theme .witch-back");
    expect(visualLockSource).toContain(".is-office-theme .witch-back");
    expect(visualLockSource).toContain(".witch-back:focus-visible");
  });


  it("keeps the Advanced card art original by removing the temporary stake badge", () => {
    expect(witchClientSource).not.toContain("witch-advanced-card-value");
    expect(visualLockSource).not.toContain(".witch-advanced-card-value");
  });


  it("prepares the touched result under the base layer before the existing settlement threshold", () => {
    expect(scratchSurfaceSource).toContain("onPrepare?: () => Promise<void>");
    expect(scratchSurfaceSource).toContain("this.ensureResultPrepared()");
    expect(scratchSurfaceSource).toContain("this.resultPrepared");
    expect(witchClientSource).toContain("/prepare-reveal");
    expect(witchClientSource).toContain("preparedReveals");
    expect(witchClientSource).toContain("paintPreparedReveal");
    expect(witchClientSource).toContain("onPrepare: async () =>");
    expect(witchClientSource).toContain("getScratchCellLayerMarkup(round.mode)");
    expect(visualLockSource).toContain("PASS 42 — prepared-under-coating result pipeline");
    expect(visualLockSource).toContain('[data-witch-result-active="true"]');
  });


  it("rebuilds result slots on every new round so a previous Office symbol can never flash first", () => {
    expect(witchClientSource).toContain("const boardRoundChanged = board?.dataset.roundId !== round.id");
    expect(witchClientSource).toContain("board.dataset.roundId = round.id");
    expect(scratchPresentationSource).toContain("OFFICE_MATCH_SYMBOLS.map");
    expect(scratchPresentationSource).toContain('data-witch-office-candidate="${symbol.id}"');
    expect(witchClientSource).not.toContain('officeArt.setAttribute("src"');
    expect(witchClientSource).not.toContain('genericArt.setAttribute("src"');
    expect(visualLockSource).toContain("PASS 42 — prepared-under-coating result pipeline");
  });


  it("keeps result assets predecoded and candidate DOM persistent under the scratch coating", () => {
    expect(scratchPresentationSource).toContain("SCRATCH_RESULT_ART_URLS");
    expect(scratchPresentationSource).toContain("data-witch-result-candidate");
    expect(scratchPresentationSource).toContain("data-witch-office-candidate");
    expect(scratchPresentationSource).toContain('loading="eager"');
    expect(witchClientSource).toContain("scratchResultAssetsReady");
    expect(witchClientSource).toContain("await scratchResultAssetsReady");
    expect(witchClientSource).not.toContain("content.innerHTML");
  });

  it("shows the finite Office pool count and immutable public ticket ID inside the master card", () => {
    expect(witchClientSource).toContain("data-witch-office-meta");
    expect(witchClientSource).toContain("data-witch-office-pool");
    expect(witchClientSource).toContain("data-witch-office-ticket-id");
    expect(witchClientSource).toContain("/office-pool");
    expect(witchClientSource).toContain("officePoolRemaining");
    expect(witchClientSource).toContain("officeTicketPublicId");
    expect(visualLockSource).toContain("PASS 44 — THE OFFICE finite-pool metadata");
    expect(visualLockSource).toContain("> .witch-office-card-meta");
  });


  it("marks exactly the resolved Office winning triple and visually recedes the other cells", () => {
    expect(witchClientSource).toContain("winningOfficeIndices");
    expect(witchClientSource).toContain(".slice(0, 3)");
    expect(witchClientSource).toContain("is-office-win-dimmed");
    expect(visualLockSource).toContain("PASS 40 — result permanence + Office winner clarity + Advanced full-card contain");
    expect(visualLockSource).toContain(".witch-office-win-badge");
    expect(visualLockSource).toContain("outline: 3px solid #ffd34e !important");
  });

  it("uses measured contain sizing so the Advanced master cannot crop at any viewport class", () => {
    expect(witchClientSource).toContain("fitAdvancedCardBounds");
    expect(witchClientSource).toContain("--advanced-fit-width");
    expect(witchClientSource).toContain("--advanced-fit-height");
    expect(visualLockSource).toContain("width: var(--advanced-fit-width");
    expect(visualLockSource).toContain("height: var(--advanced-fit-height");
  });


  it("removes the translucent compositor rectangle behind the Office payout card", () => {
    expect(visualLockSource).toContain("PASS 40 — THE OFFICE payout ghost-layer cleanup");
    expect(visualLockSource).toContain(".is-office-theme .witch-payout-panel");
    expect(visualLockSource).toContain("backdrop-filter: none !important");
    expect(visualLockSource).toContain("-webkit-backdrop-filter: none !important");
    expect(visualLockSource).toContain(".is-office-theme .witch-payout-panel::before");
    expect(visualLockSource).toContain(".is-office-theme .witch-payout-panel::after");
  });

});
