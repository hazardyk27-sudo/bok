import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const binanceSource = readFileSync(
  fileURLToPath(new URL("./binanceBtcFeed.ts", import.meta.url)),
  "utf8",
);
const coinbaseSource = readFileSync(
  fileURLToPath(new URL("./coinbaseBtcFeed.ts", import.meta.url)),
  "utf8",
);
const coordinatorSource = readFileSync(
  fileURLToPath(new URL("./marketFeedCoordinator.ts", import.meta.url)),
  "utf8",
);

describe("market feed recovery wiring contract", () => {
  it("uses capped reconnect backoff in both exchange transports", () => {
    for (const source of [binanceSource, coinbaseSource]) {
      expect(source).toContain("calculateReconnectBackoffMs(");
      expect(source).toContain("MARKET_RECONNECT_MAX_DELAY_MS");
      expect(source).toContain("private reconnectAttempt = 0;");
      expect(source).toContain("this.reconnectAttempt += 1;");
      expect(source).toContain("this.reconnectAttempt = 0;");
    }
  });

  it("schedules reconnect on error even if close-event delivery is delayed", () => {
    for (const source of [binanceSource, coinbaseSource]) {
      expect(source).toContain(
        "} finally {\n        this.scheduleReconnect(epoch);\n      }",
      );
    }
  });

  it("prioritizes Binance, then Coinbase, then frozen no-source state", () => {
    expect(coordinatorSource).toContain(
      "const selectedHealth = primary.healthy",
    );
    expect(coordinatorSource).toContain("? primary");
    expect(coordinatorSource).toContain(": backup.healthy");
    expect(coordinatorSource).toContain(
      'this.activeSource = "none";',
    );
    expect(coordinatorSource).toContain(
      'feedStatus: "FROZEN"',
    );
  });

  it("re-baselines on provider switches and connection-epoch changes", () => {
    expect(coordinatorSource).toContain(
      "const sourceChanged =",
    );
    expect(coordinatorSource).toContain(
      "const epochChanged =",
    );
    expect(coordinatorSource).toContain(
      "sourceChanged\n      || epochChanged",
    );
  });
});
