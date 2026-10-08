import { describe, expect, it } from "vitest";
import {
  BlackjackServerClient,
  BlackjackStaleActionError,
  type BlackjackServerTransport,
} from "./serverClient";
import { BlackjackServerApiError } from "./serverApi";
import type {
  BlackjackServerActionRequest,
  BlackjackServerSnapshot,
} from "./serverContract";

function snapshot(
  revision: number,
  serverTimeMs = revision,
  balanceCents = 100_000,
): BlackjackServerSnapshot {
  return {
    revision,
    roundId: revision === 0 ? null : "round-1",
    tableMin: 10,
    wallet: { balanceCents },
    round: null,
    allowedActions: revision === 0 ? ["deal"] : ["hit", "stand"],
    shoe: { cardsRemaining: 312 - revision, shufflePending: false },
    serverTimeMs,
  };
}

function transport(overrides: Partial<BlackjackServerTransport> = {}): BlackjackServerTransport {
  let key = 0;
  return {
    fetchState: async () => snapshot(0),
    sendAction: async (request) => snapshot(request.expectedRevision + 1),
    createIdempotencyKey: () => `blackjack-test-key-${++key}`,
    ...overrides,
  };
}

describe("BlackjackServerClient", () => {
  it("reconnects from the authoritative persisted snapshot", async () => {
    const restored = snapshot(7, 700, 82_500);
    const client = new BlackjackServerClient(transport({
      fetchState: async () => restored,
    }));

    await expect(client.connect()).resolves.toEqual(restored);
    expect(client.getSnapshot()).toEqual(restored);
  });

  it("serializes same-tab actions and uses the revision produced by the prior action", async () => {
    const seen: BlackjackServerActionRequest[] = [];
    const client = new BlackjackServerClient(transport({
      fetchState: async () => snapshot(4),
      sendAction: async (request) => {
        seen.push(request);
        return snapshot(request.expectedRevision + 1);
      },
    }));

    await client.connect();
    const first = client.action("hit");
    const second = client.action("stand");
    await Promise.all([first, second]);

    expect(seen.map((request) => request.expectedRevision)).toEqual([4, 5]);
    expect(seen[0]?.idempotencyKey).not.toBe(seen[1]?.idempotencyKey);
    expect(client.getSnapshot()?.revision).toBe(6);
  });

  it("adopts the authoritative stale snapshot but never replays the old click", async () => {
    const latest = snapshot(9, 900, 71_000);
    let sends = 0;
    const client = new BlackjackServerClient(transport({
      fetchState: async () => snapshot(8),
      sendAction: async () => {
        sends += 1;
        throw new BlackjackServerApiError(
          "BLACKJACK_STALE_REVISION",
          409,
          latest,
        );
      },
    }));

    await client.connect();
    await expect(client.action("hit")).rejects.toBeInstanceOf(BlackjackStaleActionError);
    expect(sends).toBe(1);
    expect(client.getSnapshot()).toEqual(latest);
  });

  it("falls back to GET state when a stale response cannot carry a snapshot", async () => {
    const latest = snapshot(3, 300);
    let fetches = 0;
    const client = new BlackjackServerClient(transport({
      fetchState: async () => {
        fetches += 1;
        return fetches === 1 ? snapshot(2, 200) : latest;
      },
      sendAction: async () => {
        throw new BlackjackServerApiError("BLACKJACK_STALE_REVISION", 409);
      },
    }));

    await client.connect();
    await expect(client.action("hit")).rejects.toBeInstanceOf(BlackjackStaleActionError);
    expect(fetches).toBe(2);
    expect(client.getSnapshot()?.revision).toBe(3);
  });

  it("uses authoritative GET resync for multi-tab changes and same-revision shared-wallet changes", async () => {
    const states = [
      snapshot(5, 500, 90_000),
      snapshot(4, 900, 10_000),
      snapshot(5, 600, 88_000),
      snapshot(6, 700, 86_000),
    ];
    let index = 0;
    const client = new BlackjackServerClient(transport({
      fetchState: async () => states[Math.min(index++, states.length - 1)]!,
    }));

    await client.connect();
    await client.refresh();
    expect(client.getSnapshot()?.revision).toBe(5);
    expect(client.getSnapshot()?.wallet.balanceCents).toBe(90_000);

    await client.refresh();
    expect(client.getSnapshot()?.revision).toBe(5);
    expect(client.getSnapshot()?.wallet.balanceCents).toBe(88_000);

    await client.refresh();
    expect(client.getSnapshot()?.revision).toBe(6);
    expect(client.getSnapshot()?.wallet.balanceCents).toBe(86_000);
  });
});
