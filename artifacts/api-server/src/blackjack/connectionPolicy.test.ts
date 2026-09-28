import { describe, expect, it } from "vitest";
import {
  claimBlackjackConnection,
  createBlackjackConnectionRegistry,
  getBlackjackActiveConnectionForUser,
  releaseBlackjackConnection,
} from "./connectionPolicy";

function identity(
  connectionId: string,
  sessionId = `session-${connectionId}`,
) {
  return {
    connectionId,
    userId: "user-1",
    playerId: "player-1",
    sessionId,
    connectedAtMs: 1,
  };
}

describe("blackjack single-account connection policy", () => {
  it("keeps exactly one active connection per user/player", () => {
    const first = claimBlackjackConnection(
      createBlackjackConnectionRegistry(),
      identity("conn-1"),
    );
    const second = claimBlackjackConnection(
      first.registry,
      identity("conn-2"),
    );

    expect(second.replayed).toBe(false);
    expect(second.replacedConnectionIds).toEqual(["conn-1"]);
    expect(second.registry.active).toHaveLength(1);
    expect(second.registry.active[0].connectionId).toBe("conn-2");
  });

  it("implements latest authenticated connection wins across devices/sessions", () => {
    const first = claimBlackjackConnection(
      createBlackjackConnectionRegistry(),
      identity("desktop", "session-desktop"),
    );
    const mobile = claimBlackjackConnection(
      first.registry,
      identity("mobile", "session-mobile"),
    );

    expect(mobile.replacedConnectionIds).toEqual(["desktop"]);
    expect(getBlackjackActiveConnectionForUser(mobile.registry, "user-1")).toMatchObject({
      connectionId: "mobile",
      sessionId: "session-mobile",
    });
  });

  it("makes exact connection claim retries idempotent", () => {
    const first = claimBlackjackConnection(
      createBlackjackConnectionRegistry(),
      identity("conn-1"),
    );
    const replay = claimBlackjackConnection(
      first.registry,
      { ...identity("conn-1"), connectedAtMs: 999 },
    );

    expect(replay.replayed).toBe(true);
    expect(replay.registry).toBe(first.registry);
    expect(replay.replacedConnectionIds).toEqual([]);
  });

  it("rejects connectionId reuse for a different identity", () => {
    const first = claimBlackjackConnection(
      createBlackjackConnectionRegistry(),
      identity("conn-1"),
    );

    expect(() =>
      claimBlackjackConnection(first.registry, {
        ...identity("conn-1"),
        userId: "user-2",
        playerId: "player-2",
      }),
    ).toThrow(/connectionId conflict/);
  });

  it("rejects one user attempting to hold two player identities", () => {
    const first = claimBlackjackConnection(
      createBlackjackConnectionRegistry(),
      identity("conn-1"),
    );

    expect(() =>
      claimBlackjackConnection(first.registry, {
        connectionId: "conn-2",
        userId: "user-1",
        playerId: "player-2",
        sessionId: "session-2",
        connectedAtMs: 2,
      }),
    ).toThrow(/multiple player identities/);
  });

  it("ignores late close cleanup from a connection that was already replaced", () => {
    const first = claimBlackjackConnection(
      createBlackjackConnectionRegistry(),
      identity("old"),
    );
    const latest = claimBlackjackConnection(
      first.registry,
      identity("new"),
    );

    const afterOldClose = releaseBlackjackConnection(
      latest.registry,
      "old",
    );
    expect(afterOldClose).toBe(latest.registry);
    expect(afterOldClose.active[0].connectionId).toBe("new");

    const afterNewClose = releaseBlackjackConnection(
      afterOldClose,
      "new",
    );
    expect(afterNewClose.active).toHaveLength(0);
  });
});
