import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const walletClientSource = readFileSync(
  fileURLToPath(new URL("../game/SlotWalletClient.ts", import.meta.url)),
  "utf8",
);

describe("slot provisional board settlement contract", () => {
  it("invalidates a streamed board when settlement fails without delaying successful result rendering", () => {
    expect(walletClientSource).toContain("setBoardCanvasVisible(false)");
    expect(walletClientSource).toContain("revealBoardOnNextFrame()");
    expect(walletClientSource).toContain('canvas.style.visibility = visible ? "" : "hidden"');

    const firstResult = walletClientSource.indexOf('if (first.event !== "result")');
    const settlementStart = walletClientSource.indexOf("const settlement = (async");
    const failureHide = walletClientSource.indexOf("setBoardCanvasVisible(false)");
    const reveal = walletClientSource.lastIndexOf("revealBoardOnNextFrame()");
    const responseReturn = walletClientSource.lastIndexOf("return {");

    expect(firstResult).toBeGreaterThan(0);
    expect(settlementStart).toBeGreaterThan(firstResult);
    expect(failureHide).toBeGreaterThan(settlementStart);
    expect(reveal).toBeGreaterThan(settlementStart);
    expect(responseReturn).toBeGreaterThan(reveal);
  });
});
