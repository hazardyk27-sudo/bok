import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BlackjackServerApiError,
  sendBlackjackServerActionReliable,
} from "./serverApi";
import type {
  BlackjackServerActionRequest,
  BlackjackServerSnapshot,
} from "./serverContract";

function snapshot(revision: number): BlackjackServerSnapshot {
  return {
    revision,
    roundId: "round-1",
    tableMin: 10,
    wallet: { balanceCents: 90_000 },
    round: null,
    allowedActions: ["hit", "stand"],
    shoe: { cardsRemaining: 300, shufflePending: false },
    serverTimeMs: 1000 + revision,
  };
}

const request: BlackjackServerActionRequest = {
  expectedRevision: 4,
  idempotencyKey: "blackjack-retry-key-0001",
  action: "hit",
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("sendBlackjackServerActionReliable", () => {
  it("retries an ambiguous transport failure with the exact same request body", async () => {
    const bodies: string[] = [];
    let attempt = 0;
    globalThis.fetch = vi.fn(async (_input, init) => {
      bodies.push(String(init?.body ?? ""));
      attempt += 1;
      if (attempt === 1) {
        throw new TypeError("network lost after send");
      }
      return new Response(JSON.stringify(snapshot(5)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await expect(sendBlackjackServerActionReliable(request, 1)).resolves.toMatchObject({
      revision: 5,
    });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(JSON.parse(bodies[0] ?? "{}").idempotencyKey).toBe(request.idempotencyKey);
  });

  it("retries a non-JSON 5xx gateway response with the same idempotent request", async () => {
    const bodies: string[] = [];
    let attempt = 0;
    globalThis.fetch = vi.fn(async (_input, init) => {
      bodies.push(String(init?.body ?? ""));
      attempt += 1;
      if (attempt === 1) {
        return new Response("bad gateway", { status: 502 });
      }
      return new Response(JSON.stringify(snapshot(5)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await expect(sendBlackjackServerActionReliable(request, 1)).resolves.toMatchObject({
      revision: 5,
    });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
  });

  it("does not retry a stale revision and exposes the authoritative recovery snapshot", async () => {
    const latest = snapshot(6);
    let attempts = 0;
    globalThis.fetch = vi.fn(async () => {
      attempts += 1;
      return new Response(JSON.stringify({
        error: "BLACKJACK_STALE_REVISION",
        snapshot: latest,
      }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await sendBlackjackServerActionReliable(request, 2);
      throw new Error("expected stale failure");
    } catch (error) {
      expect(error).toBeInstanceOf(BlackjackServerApiError);
      const apiError = error as BlackjackServerApiError;
      expect(apiError.message).toBe("BLACKJACK_STALE_REVISION");
      expect(apiError.snapshot).toEqual(latest);
    }
    expect(attempts).toBe(1);
  });
});
