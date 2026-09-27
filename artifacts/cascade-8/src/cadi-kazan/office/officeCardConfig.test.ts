import { describe, expect, it } from "vitest";
import {
  OFFICE_MATCH_CARD_CONFIG,
  OFFICE_MATCH_SYMBOLS,
  OFFICE_MATCH_TARGET_RTP_BPS,
} from "./officeCardConfig";

describe("The Office match-3 card config", () => {
  it("uses a 3x2 board with exactly six scratch cells", () => {
    expect(OFFICE_MATCH_CARD_CONFIG.columns).toBe(3);
    expect(OFFICE_MATCH_CARD_CONFIG.rows).toBe(2);
    expect(OFFICE_MATCH_CARD_CONFIG.cellCount).toBe(6);
    expect(OFFICE_MATCH_CARD_CONFIG.requiredMatches).toBe(3);
  });

  it("locks the five approved character multipliers", () => {
    expect(OFFICE_MATCH_SYMBOLS.map(({ id, multiplierBps, special }) => ({
      id,
      multiplierBps,
      special,
    }))).toEqual([
      { id: "KEVIN", multiplierBps: 200, special: false },
      { id: "JIM", multiplierBps: 500, special: false },
      { id: "DWIGHT", multiplierBps: 1_000, special: false },
      { id: "STANLEY", multiplierBps: 2_000, special: false },
      { id: "MICHAEL", multiplierBps: 10_000, special: true },
    ]);
  });

  it("keeps Michael Scott as the single 100x special symbol", () => {
    const specialSymbols = OFFICE_MATCH_SYMBOLS.filter((symbol) => symbol.special);
    expect(specialSymbols).toHaveLength(1);
    expect(specialSymbols[0]).toMatchObject({
      id: "MICHAEL",
      multiplierBps: 10_000,
    });
    expect(OFFICE_MATCH_CARD_CONFIG.specialSymbolId).toBe("MICHAEL");
  });

  it("keeps the working RTP target at 96 percent without defining outcome weights yet", () => {
    expect(OFFICE_MATCH_TARGET_RTP_BPS).toBe(9_600);
  });

  it("maps every approved symbol to its Cadı Kazan-owned artwork asset", () => {
    expect(OFFICE_MATCH_SYMBOLS.map(({ id, artworkUrl }) => ({
      id,
      asset: artworkUrl.split("/").at(-1),
    }))).toEqual([
      { id: "KEVIN", asset: "office-kevin-2x.webp" },
      { id: "JIM", asset: "office-jim-5x.webp" },
      { id: "DWIGHT", asset: "office-dwight-10x.webp" },
      { id: "STANLEY", asset: "office-stanley-20x.webp" },
      { id: "MICHAEL", asset: "office-michael-100x.webp" },
    ]);
  });

});
