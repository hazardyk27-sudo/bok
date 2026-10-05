import { describe, expect, it } from "vitest";
import { renderBlackjackCardStack } from "./tableView";

describe("blackjack casino card design", () => {
  it("renders visible cards with two readable corners and a central rank/suit mark", () => {
    const markup=renderBlackjackCardStack([
      { rank:"K", suit:"HEARTS" },
    ],0,"is-dealer");

    expect(markup).toContain('data-card-rank="K"');
    expect(markup).toContain('data-card-suit="HEARTS"');
    expect(markup).toContain("blackjack-card-corner is-top");
    expect(markup).toContain("blackjack-card-corner is-bottom");
    expect(markup).toContain("blackjack-card-center-rank");
    expect(markup).toContain("blackjack-card-center-suit");
    expect(markup).toContain("is-red");
    expect(markup).toContain("is-court");
    expect(markup).toContain("K of hearts");
  });

  it("keeps black suits black and marks aces distinctly", () => {
    const markup=renderBlackjackCardStack([
      { rank:"A", suit:"SPADES" },
    ],0);

    expect(markup).not.toContain("is-red");
    expect(markup).toContain("is-ace");
    expect(markup).toContain("♠");
  });

  it("renders dealer hole cards as a dedicated face-down casino back", () => {
    const markup=renderBlackjackCardStack([null],0,"is-dealer");

    expect(markup).toContain('data-card-hidden="true"');
    expect(markup).toContain("blackjack-card-back");
    expect(markup).toContain("blackjack-card-back-frame");
    expect(markup).toContain("Hidden card");
    expect(markup).not.toContain("data-card-rank");
  });
});
