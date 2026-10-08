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

function snapshot(revision: number): BlackjackServerSnapshot {
  return {
    revision,
    roundId: revision === 0 ? null : "round-edge",
    tableMin: 10,
    wallet: { balanceCents: 100_000 - revision * 100 },
    round: null,
    allowedActions: revision === 0 ? ["deal"] : ["hit", "stand"],
    shoe: { cardsRemaining: 312 - revision, shufflePending: false },
    serverTimeMs: 10_000 + revision,
  };
}

describe("BlackjackServerClient queued stale recovery", () => {
  it("lets the next queued click use the stale-recovery revision without replaying the first click", async () => {
    const seen: BlackjackServerActionRequest[] = [];
    let key = 0;
    const transport: BlackjackServerTransport = {
      fetchState: async () => snapshot(4),
      createIdempotencyKey: () => `queued-edge-key-${++key}`,
      sendAction: async (request) => {
        seen.push(request);
        if (request.action === "hit") {
          throw new BlackjackServerApiError(
            "BLACKJACK_STALE_REVISION",
            409,
            snapshot(6),
          );
        }
        return snapshot(request.expectedRevision + 1);
      },
    };
    const client = new BlackjackServerClient(transport);

    await client.connect();
    const first = client.action("hit");
    const second = client.action("stand");
    const [firstResult, secondResult] = await Promise.allSettled([first, second]);

    expect(firstResult.status).toBe("rejected");
    if (firstResult.status === "rejected") {
      expect(firstResult.reason).toBeInstanceOf(BlackjackStaleActionError);
    }
    expect(secondResult.status).toBe("fulfilled");
    if (secondResult.status === "fulfilled") {
      expect(secondResult.value.revision).toBe(7);
    }

    expect(seen.map((request) => [request.action, request.expectedRevision])).toEqual([
      ["hit", 4],
      ["stand", 6],
    ]);
    expect(seen[0]?.idempotencyKey).not.toBe(seen[1]?.idempotencyKey);
    expect(client.getSnapshot()?.revision).toBe(7);
  });
});
