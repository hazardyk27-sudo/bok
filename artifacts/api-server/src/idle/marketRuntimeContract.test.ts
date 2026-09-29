import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const runtimeSource = readFileSync(
  fileURLToPath(new URL("./marketRuntime.ts", import.meta.url)),
  "utf8",
);

const runtimeDbSource = readFileSync(
  fileURLToPath(new URL("./marketRuntimeDb.ts", import.meta.url)),
  "utf8",
);

const routesSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);

const idleIndexSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);

describe("global market runtime/API source contract", () => {
  it("runs aligned five-second leader ticks and samples both warm feeds", () => {
    expect(runtimeSource).toContain(
      "MARKET_CONFIG.tickMs",
    );
    expect(runtimeSource).toContain(
      "getDelayUntilNextMarketTick(",
    );
    expect(runtimeSource).toContain(
      "this.leadership.runIfLeader(",
    );
    expect(runtimeSource).toContain(
      "binance: this.binance.getSnapshot()",
    );
    expect(runtimeSource).toContain(
      "coinbase: this.coinbase.getSnapshot()",
    );
  });

  it("restores the persisted price and requires a BTC rebaseline before movement", () => {
    expect(runtimeSource).toContain(
      "await this.persistence.ensureCurrentState(",
    );
    expect(runtimeSource).toContain(
      "this.previousBtcQuoteMicrodollars = null;",
    );
    expect(runtimeSource).toContain(
      'nextFeedStatus = "REBASELINING";',
    );
    expect(runtimeSource).toContain(
      "calculateNextTicketPriceFromBtcMove({",
    );
  });

  it("freezes price when neither provider is healthy", () => {
    expect(runtimeSource).toContain(
      'selection.source === "none"',
    );
    expect(runtimeSource).toContain(
      'nextFeedStatus = "FROZEN";',
    );
    expect(runtimeSource).toContain(
      'nextSource = "none";',
    );
  });

  it("keeps follower SSE clients synchronized from persisted leader state", () => {
    expect(runtimeSource).toContain(
      "if (!result.executed) {",
    );
    expect(runtimeSource).toContain(
      "await this.syncFromPersistence();",
    );
    expect(runtimeSource).toContain(
      "this.listeners",
    );
  });

  it("wires the default runtime to both exchanges, coordinator, persistence and advisory leadership", () => {
    expect(runtimeDbSource).toContain(
      "new BinanceBtcUsdtFeed()",
    );
    expect(runtimeDbSource).toContain(
      "new CoinbaseBtcUsdFeed()",
    );
    expect(runtimeDbSource).toContain(
      "new MarketFeedCoordinator()",
    );
    expect(runtimeDbSource).toContain(
      "persistence: ticketMarketPersistence",
    );
    expect(runtimeDbSource).toContain(
      "leadership: globalMarketWriterLeadership",
    );
  });

  it("exposes current, 24-hour history and SSE live market routes", () => {
    expect(routesSource).toContain(
      'router.get("/idle/market"',
    );
    expect(routesSource).toContain(
      'router.get("/idle/market/history"',
    );
    expect(routesSource).toContain(
      'router.get("/idle/market/live"',
    );
    expect(routesSource).toContain(
      '"Content-Type": "text/event-stream"',
    );
    expect(routesSource).toContain(
      'event: market\\ndata:',
    );
    expect(routesSource).toContain(
      'res.write(": keepalive\\n\\n")',
    );
  });

  it("starts the market runtime when the owned Idle API module is loaded", () => {
    expect(idleIndexSource).toContain(
      "ticketMarketRuntime.start()",
    );
    expect(idleIndexSource).toContain(
      "Unable to start Idle ticket market runtime",
    );
  });
});
