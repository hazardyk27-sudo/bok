import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(
  fileURLToPath(new URL("./main.ts", import.meta.url)),
  "utf8",
);

const menuStart = mainSource.indexOf("const mainMenuMarkup =");
const menuEnd = mainSource.indexOf("const rouletteRedNumbers", menuStart);
const menuSource = mainSource.slice(menuStart, menuEnd);

describe("main menu regression", () => {
  it("keeps the three existing game destinations and adds Businesses as the fourth card", () => {
    expect(menuSource).toContain('class="game-choice game-choice-slot" href="/slot"');
    expect(menuSource).toContain('class="game-choice game-choice-roulette" href="/roulette"');
    expect(menuSource).toContain('class="game-choice game-choice-witch" href="/cadi-kazan"');
    expect(menuSource).toContain('class="game-choice game-choice-businesses" href="/businesses"');

    expect(menuSource.match(/class="game-choice game-choice-/g)).toHaveLength(4);
    expect(menuSource).toContain("ONE LOUNGE · FOUR WORLDS");
  });

  it("preserves the existing selector identity for Slot, Roulette and Cadı Kazan", () => {
    expect(menuSource).toContain("<span class=\"choice-overline\">CASCADE 8</span>");
    expect(menuSource).toContain("<strong>FAHRİNİN YOLU</strong>");
    expect(menuSource).toContain("<span class=\"choice-type\">SLOT EXPERIENCE</span>");

    expect(menuSource).toContain("<span class=\"choice-overline\">THE NIGHT TABLE</span>");
    expect(menuSource).toContain("<strong>ROULETTE</strong>");
    expect(menuSource).toContain("<span class=\"choice-type\">TABLE EXPERIENCE</span>");

    expect(menuSource).toContain("<span class=\"choice-overline\">LUCKY SCRATCH</span>");
    expect(menuSource).toContain("<strong>CADI KAZAN</strong>");
    expect(menuSource).toContain("<span class=\"choice-type\">SCRATCH EXPERIENCE</span>");
  });

  it("keeps unknown non-game paths on the main selector instead of entering a game", () => {
    expect(mainSource).toContain(
      '} else if (!isSlotRoute) {\n  app.innerHTML = routeShell(mainMenuMarkup, "is-route-page is-menu-page");',
    );
  });
});
