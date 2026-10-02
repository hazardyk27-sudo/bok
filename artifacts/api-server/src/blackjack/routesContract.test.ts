import { describe, expect, it } from "vitest";
import {
  BLACKJACK_API_BASE,
  BLACKJACK_HEALTH_PATH,
  buildBlackjackHealthPayload,
  BLACKJACK_MAX_SEATS,
  BLACKJACK_ROUTER_BASE,
} from "./routes";
import { BLACKJACK_WS_PATH } from "./realtime";
import {
  markBlackjackRuntimeFailed,
  markBlackjackRuntimeStarting,
  markBlackjackRuntimeStopped,
} from "./serverRuntime";

describe("blackjack central integration route contract",()=>{
  it("keeps public /api paths separate from the router mounted under /api",()=>{
    expect(BLACKJACK_API_BASE).toBe("/api/blackjack");
    expect(BLACKJACK_ROUTER_BASE).toBe("/blackjack");
    expect(BLACKJACK_HEALTH_PATH).toBe("/api/blackjack/health");
    expect(BLACKJACK_WS_PATH).toBe("/api/blackjack/ws");
    expect(BLACKJACK_MAX_SEATS).toBe(5);

    expect("/api"+BLACKJACK_ROUTER_BASE+"/health")
      .toBe(BLACKJACK_HEALTH_PATH);
  });

  it("reports startup and failure truthfully instead of static integration-ready",()=>{
    markBlackjackRuntimeStarting(1);
    expect(buildBlackjackHealthPayload()).toMatchObject({
      ready:false,
      status:"STARTING",
      attempt:1,
      runtimeStatus:null,
      failureCode:null,
    });

    markBlackjackRuntimeFailed(2);
    expect(buildBlackjackHealthPayload()).toMatchObject({
      ready:false,
      status:"FAILED",
      attempt:2,
      runtimeStatus:null,
      failureCode:"BLACKJACK_RUNTIME_ATTACH_FAILED",
    });

    markBlackjackRuntimeStopped();
  });
});
