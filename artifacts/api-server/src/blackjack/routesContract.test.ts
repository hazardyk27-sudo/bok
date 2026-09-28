import { describe, expect, it } from "vitest";
import {
  BLACKJACK_API_BASE,
  BLACKJACK_HEALTH_PATH,
  BLACKJACK_MAX_SEATS,
  BLACKJACK_ROUTER_BASE,
} from "./routes";
import { BLACKJACK_WS_PATH } from "./realtime";

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
});
