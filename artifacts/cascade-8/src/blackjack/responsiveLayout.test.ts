import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css=readFileSync(
  new URL("./blackjack.css",import.meta.url),
  "utf8",
);

describe("blackjack responsive layout contract",()=>{
  it("uses a 16:9 desktop table constrained by viewport height",()=>{
    expect(css).toContain("/* Part 9: responsive table geometry */");
    expect(css).toContain("aspect-ratio: 16 / 9");
    expect(css).toContain("calc(177.78dvh - 391px)");
    expect(css).toContain("@media (min-width: 1100px) and (min-aspect-ratio: 16 / 10)");
  });

  it("drives seat placement through responsive geometry variables",()=>{
    expect(css).toContain("--blackjack-seat-width");
    expect(css).toContain("--blackjack-seat-left");
    expect(css).toContain("--blackjack-seat-right");
    expect(css).toContain("--blackjack-seat-top");
    expect(css).toContain("--blackjack-seat-bottom");
    expect(css).toContain("--blackjack-seat-transform: translateX(-50%)");
  });

  it("has independent short-landscape and portrait-tablet layouts",()=>{
    expect(css).toContain(
      "@media (orientation: landscape) and (max-height: 760px)",
    );
    expect(css).toContain(
      "@media (orientation: portrait) and (min-width: 600px) and (max-width: 1024px)",
    );
    expect(css).toContain("aspect-ratio: 4 / 3");
  });

  it("uses a scroll-safe portrait mobile table instead of fixed minimum height",()=>{
    expect(css).toContain(
      "@media (orientation: portrait) and (max-width: 599px)",
    );
    expect(css).toContain("overflow-y: auto !important");
    expect(css).toContain("overscroll-behavior-y: contain");
    expect(css).toContain("-webkit-overflow-scrolling: touch");
    expect(css).toContain("aspect-ratio: 4 / 5");
    expect(css).toContain("position: sticky");
    expect(css).toContain("--blackjack-seat-width: clamp(92px, 27vw, 108px)");
  });
});
