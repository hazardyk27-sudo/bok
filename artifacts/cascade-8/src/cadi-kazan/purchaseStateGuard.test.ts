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

  it("serializes the initial state bootstrap before a purchase can create another session", () => {
    expect(guardSource).toContain("let stateBootstrapInFlight: Promise<Response> | null = null");
    expect(guardSource).toContain("let stateBootstrapReady = false");
    expect(guardSource).toContain("await ensureStateBootstrap(nativeFetch)");
    expect(guardSource).toContain("canonical game_session");
  });

  it("bounds state and purchase requests so dead transports cannot freeze the buy button", () => {
    expect(guardSource).toContain("const STATE_ATTEMPT_TIMEOUT_MS = 1_800");
    expect(guardSource).toContain("const PURCHASE_ATTEMPT_TIMEOUT_MS = 2_500");
    expect(guardSource).toContain("const PURCHASE_RECONCILE_TIMEOUT_MS = 1_500");
    expect(guardSource).toContain("signal: AbortSignal.timeout(timeoutMs)");
  });

  it("coalesces concurrent card purchases into one in-flight request", () => {
    expect(guardSource).toContain("let purchaseInFlight: Promise<Response> | null = null");
    expect(guardSource).toContain("const alreadyRunning = purchaseInFlight");
    expect(guardSource).toContain("return response.clone()");
  });

  it("retries transient purchase failures with the same request body/idempotency key", () => {
    expect(guardSource).toContain("new Set([502, 503, 504])");
    expect(guardSource).toContain("const PURCHASE_MAX_ATTEMPTS = 2");
    expect(guardSource).toContain("fetchPurchaseWithSafeRetry");
    expect(guardSource).toContain("Every replay uses the exact same body");
    expect(guardSource).toContain("idempotency key");
  });

  it("reconciles an uncertain timeout through authoritative state before asking for another purchase", () => {
    expect(guardSource).toContain("reconcilePurchaseState");
    expect(guardSource).toContain("stateMatchesPurchase");
    expect(guardSource).toContain('round.status !== "ACTIVE"');
    expect(guardSource).toContain("round.mode !== fingerprint.mode");
    expect(guardSource).toContain("round.stakeCents !== fingerprint.stakeCents");
  });

  it("refreshes state instead of applying a wallet snapshot older than a mutation", () => {
    expect(guardSource).toContain("const startedAtGeneration = mutationGeneration");
    expect(guardSource).toContain("if (startedAtGeneration !== mutationGeneration) {");
    expect(guardSource).toContain("await waitForResponse(purchaseInFlight)");
    expect(guardSource).toContain("if (activePurchase)");
  });
});
