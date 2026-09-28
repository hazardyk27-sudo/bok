export type BlackjackConnectionIdentity = Readonly<{
  connectionId: string;
  userId: string;
  playerId: string;
  sessionId: string;
  connectedAtMs: number;
}>;

export type BlackjackConnectionRegistry = Readonly<{
  active: readonly BlackjackConnectionIdentity[];
}>;

export type BlackjackConnectionClaimResult = Readonly<{
  registry: BlackjackConnectionRegistry;
  active: BlackjackConnectionIdentity;
  replacedConnectionIds: readonly string[];
  replayed: boolean;
}>;

function assertNonEmptyId(label: string, value: string): void {
  if (!value.trim()) {
    throw new RangeError(`Blackjack ${label} must be a non-empty string`);
  }
}

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError("Blackjack connectedAtMs must be a non-negative safe integer");
  }
}

function freezeIdentity(
  identity: BlackjackConnectionIdentity,
): BlackjackConnectionIdentity {
  return Object.freeze({ ...identity });
}

function freezeRegistry(
  active: readonly BlackjackConnectionIdentity[],
): BlackjackConnectionRegistry {
  return Object.freeze({
    active: Object.freeze(active.map(freezeIdentity)),
  });
}

function sameIdentity(
  left: BlackjackConnectionIdentity,
  right: BlackjackConnectionIdentity,
): boolean {
  return (
    left.connectionId === right.connectionId &&
    left.userId === right.userId &&
    left.playerId === right.playerId &&
    left.sessionId === right.sessionId
  );
}

function validateIdentity(identity: BlackjackConnectionIdentity): void {
  assertNonEmptyId("connectionId", identity.connectionId);
  assertNonEmptyId("userId", identity.userId);
  assertNonEmptyId("playerId", identity.playerId);
  assertNonEmptyId("sessionId", identity.sessionId);
  assertNowMs(identity.connectedAtMs);
}

export function createBlackjackConnectionRegistry(): BlackjackConnectionRegistry {
  return freezeRegistry([]);
}

export function claimBlackjackConnection(
  registry: BlackjackConnectionRegistry,
  identity: BlackjackConnectionIdentity,
): BlackjackConnectionClaimResult {
  validateIdentity(identity);

  const existingByConnectionId = registry.active.find(
    (candidate) => candidate.connectionId === identity.connectionId,
  );
  if (existingByConnectionId) {
    if (!sameIdentity(existingByConnectionId, identity)) {
      throw new Error(
        `Blackjack connectionId conflict: ${identity.connectionId}`,
      );
    }

    return Object.freeze({
      registry,
      active: existingByConnectionId,
      replacedConnectionIds: Object.freeze([]),
      replayed: true,
    });
  }

  const replaced = registry.active.filter(
    (candidate) =>
      candidate.userId === identity.userId ||
      candidate.playerId === identity.playerId,
  );

  for (const candidate of replaced) {
    if (
      candidate.userId === identity.userId &&
      candidate.playerId !== identity.playerId
    ) {
      throw new Error(
        "Blackjack user cannot own multiple player identities",
      );
    }
    if (
      candidate.playerId === identity.playerId &&
      candidate.userId !== identity.userId
    ) {
      throw new Error(
        "Blackjack player identity cannot move between users",
      );
    }
  }

  const replacedIds = new Set(
    replaced.map((candidate) => candidate.connectionId),
  );
  const active = freezeIdentity(identity);
  const nextRegistry = freezeRegistry([
    ...registry.active.filter(
      (candidate) => !replacedIds.has(candidate.connectionId),
    ),
    active,
  ]);

  return Object.freeze({
    registry: nextRegistry,
    active,
    replacedConnectionIds: Object.freeze([...replacedIds]),
    replayed: false,
  });
}

export function releaseBlackjackConnection(
  registry: BlackjackConnectionRegistry,
  connectionId: string,
): BlackjackConnectionRegistry {
  assertNonEmptyId("connectionId", connectionId);
  if (!registry.active.some((entry) => entry.connectionId === connectionId)) {
    return registry;
  }

  return freezeRegistry(
    registry.active.filter((entry) => entry.connectionId !== connectionId),
  );
}

export function getBlackjackActiveConnectionForUser(
  registry: BlackjackConnectionRegistry,
  userId: string,
): BlackjackConnectionIdentity | null {
  assertNonEmptyId("userId", userId);
  return registry.active.find((entry) => entry.userId === userId) ?? null;
}
