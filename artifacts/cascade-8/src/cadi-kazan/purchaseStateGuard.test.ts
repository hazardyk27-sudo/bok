import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const guardSource = readFileSync(
  fileURLToPath(new URL("./purchaseStateGuard.ts", import.meta.url)),
  "utf8",
);
const routeSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);

describe("Cadı Kazan purchase/state guard", () => {
  it("is installed before WitchClient starts its initial state load", () => {
    const installAt = routeSource.indexOf("installCadiPurchaseStateGuard();");
    const clientAt = routeSource.indexOf("client = new WitchClient(witchRoot);");
    expect(installAt).toBeGreaterThan(-1);
    expect(clientAt).toBeGreaterThan(installAt);
  });

  it("coalesces concurrent card purchases into one in-flight request", () => {
    expect(guardSource).toContain("let purchaseInFlight: Promise<Response> | null = null");
    expect(guardSource).toContain("const alreadyRunning = purchaseInFlight");
    expect(guardSource).toContain("return response.clone()");
  });

  it("retries a lost purchase response with the same request body/idempotency key", () => {
    expect(guardSource).toContain("new Set([502, 503, 504])");
    expect(guardSource).toContain("fetchPurchaseWithSafeRetry");
    expect(guardSource).toContain("return nativeFetch(input, init)");
  });

  it("refreshes state instead of applying a wallet snapshot older than a mutation", () => {
    expect(guardSource).toContain("const startedAtGeneration = mutationGeneration");
    expect(guardSource).toContain("if (startedAtGeneration !== mutationGeneration) {");
    expect(guardSource).toContain("await waitForPurchaseToSettle(purchaseInFlight)");
    expect(guardSource).toContain("if (activePurchase)");
  });
});
