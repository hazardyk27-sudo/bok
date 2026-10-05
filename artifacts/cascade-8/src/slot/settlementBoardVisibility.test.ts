import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const walletClientSource = readFileSync(
  fileURLToPath(new URL("../game/SlotWalletClient.ts", import.meta.url)),
  "utf8",
);

describe("slot provisional board settlement contract", () => {
  it("invalidates a failed provisional board and recovers only after authoritative state sync", () => {
    expect(walletClientSource).toContain("invalidateProvisionalBoard()");
    expect(walletClientSource).toContain("boardVisibilityEpoch += 1");
    expect(walletClientSource).toContain("recoverBoardAfterAuthoritativeSync()");
    expect(walletClientSource).toContain('markBoardRecovering("settlement-sync")');
    expect(walletClientSource).toContain('requestRecoveryReload("authoritative-resync")');
    expect(walletClientSource).toContain('canvas.style.visibility = visible ? "" : "hidden"');

    const firstResult = walletClientSource.indexOf('if (first.event !== "result")');
    const settlementStart = walletClientSource.indexOf("const settlement = (async");
    const failureHide = walletClientSource.lastIndexOf("invalidateProvisionalBoard()");
    const bootstrapRecovery = walletClientSource.indexOf("recoverBoardAfterAuthoritativeSync();");

    expect(firstResult).toBeGreaterThan(0);
    expect(settlementStart).toBeGreaterThan(firstResult);
    expect(failureHide).toBeGreaterThan(settlementStart);
    expect(bootstrapRecovery).toBeGreaterThan(0);
  });

  it("bounds state, spin response, result-stream and settlement-stream waits", () => {
    expect(walletClientSource).toContain("BOOTSTRAP_TIMEOUT_MS = 4_000");
    expect(walletClientSource).toContain("SPIN_RESPONSE_TIMEOUT_MS = 6_000");
    expect(walletClientSource).toContain("SPIN_RESULT_EVENT_TIMEOUT_MS = 6_000");
    expect(walletClientSource).toContain("SETTLEMENT_EVENT_TIMEOUT_MS = 8_000");
    expect(walletClientSource).toContain("fetchWithTimeout(");
    expect(walletClientSource).toContain("new AbortController()");
    expect(walletClientSource).toContain('throw new Error("SLOT_STREAM_TIMEOUT")');
    expect(walletClientSource).toContain("reader.cancel()");
    expect(walletClientSource).toContain("nextEvent(SPIN_RESULT_EVENT_TIMEOUT_MS)");
    expect(walletClientSource).toContain("nextEvent(SETTLEMENT_EVENT_TIMEOUT_MS)");
  });

  it("self-heals missing renderer mounts, failed Slot assets and WebGL context loss", () => {
    expect(walletClientSource).toContain("ensureSlotRendererMounted()");
    expect(walletClientSource).toContain("RENDERER_MOUNT_TIMEOUT_MS = 2_500");
    expect(walletClientSource).toContain('"webglcontextlost"');
    expect(walletClientSource).toContain('"webglcontextrestored"');
    expect(walletClientSource).toContain("event.preventDefault()");
    expect(walletClientSource).toContain('source.includes("/team-logos/")');
    expect(walletClientSource).toContain('source.includes("/special-symbols/")');
    expect(walletClientSource).toContain('requestRecoveryReload("slot-asset-load-error")');
    expect(walletClientSource).toContain('requestRecoveryReload("renderer-mount-timeout")');
  });
});
