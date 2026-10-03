import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const routesSource = readFileSync(
  fileURLToPath(new URL("../routes/index.ts", import.meta.url)),
  "utf8",
);

describe("blackjack session identity route order", () => {
  it("runs account/canonical identity middleware before the blackjack session platform route", () => {
    expect(routesSource).toContain("blackjackSessionIdentityMiddleware");
    expect(routesSource).toContain("blackjackPlatformRouter");
    expect(routesSource.indexOf("router.use(blackjackSessionIdentityMiddleware)"))
      .toBeGreaterThan(-1);
    expect(routesSource.indexOf("router.use(blackjackSessionIdentityMiddleware)"))
      .toBeLessThan(routesSource.indexOf("router.use(blackjackPlatformRouter)"));
  });
});
