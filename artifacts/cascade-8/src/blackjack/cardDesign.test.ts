import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderBlackjackCardStack } from "./tableView";

const CARD_CSS=readFileSync(new URL("./cardDesign.css",import.meta.url),"utf8");

describe("blackjack casino card design", () => {
  it("renders visible cards with explicit rank, suit and accessible identity", () => {
    const markup=renderBlackjackCardStack([
      { rank:"K", suit:"HEARTS" },
    ],0,"is-dealer");

    expect(markup).toContain('data-card-rank="K"');
    expect(markup).toContain('data-card-suit="HEARTS"');
    expect(markup).toContain("is-red");
    expect(markup).toContain("<strong>K</strong>");
    expect(markup).toContain("♥");
    expect(markup).toContain("K of hearts");
  });

  it("uses CSS-generated opposite corner ranks and central suit marks", () => {
    expect(CARD_CSS).toContain(".blackjack-card-face::before");
    expect(CARD_CSS).toContain("content: attr(data-card-rank)");
    expect(CARD_CSS).toContain('[data-card-suit="HEARTS"]::after');
    expect(CARD_CSS).toContain('[data-card-suit="SPADES"]::after');
    expect(CARD_CSS).toContain('[data-card-rank="K"]::after');
  });

  it("renders dealer hole cards as a dedicated face-down casino back", () => {
    const markup=renderBlackjackCardStack([null],0,"is-dealer");

    expect(markup).toContain('data-card-hidden="true"');
    expect(markup).toContain("is-hole");
    expect(markup).toContain("Hidden card");
    expect(markup).not.toContain("data-card-rank");
    expect(CARD_CSS).toContain(".blackjack-card-face.is-hole");
  });

  it("keeps dealer cards visually larger than seated player cards", () => {
    expect(CARD_CSS).toContain(".blackjack-card-placeholder.is-dealer.blackjack-card-face");
    expect(CARD_CSS).toContain(".blackjack-seat .blackjack-card-face");
  });
});
