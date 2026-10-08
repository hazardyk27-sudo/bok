import type {
  BlackjackDealSeat,
  BlackjackServerActionName,
  BlackjackServerActionRequest,
  BlackjackServerSnapshot,
} from "./serverContract";
import {
  BlackjackServerApiError,
  createBlackjackIdempotencyKey,
  fetchBlackjackServerState,
  sendBlackjackServerActionReliable,
} from "./serverApi";

export type BlackjackServerTransport = {
  fetchState(): Promise<BlackjackServerSnapshot>;
  sendAction(request: BlackjackServerActionRequest): Promise<BlackjackServerSnapshot>;
  createIdempotencyKey(): string;
};

export type BlackjackSnapshotBus = {
  publish(snapshot: BlackjackServerSnapshot): void;
  subscribe(listener: (snapshot: BlackjackServerSnapshot) => void): () => void;
};

export type BlackjackServerClientListener = (
  snapshot: BlackjackServerSnapshot,
) => void;

export class BlackjackStaleActionError extends Error {
  readonly snapshot: BlackjackServerSnapshot;

  constructor(snapshot: BlackjackServerSnapshot) {
    super("BLACKJACK_STALE_ACTION_RESYNCED");
    this.name = "BlackjackStaleActionError";
    this.snapshot = snapshot;
  }
}

const browserTransport: BlackjackServerTransport = {
  fetchState: fetchBlackjackServerState,
  sendAction: sendBlackjackServerActionReliable,
  createIdempotencyKey: createBlackjackIdempotencyKey,
};

function shouldAcceptSnapshot(
  current: BlackjackServerSnapshot | null,
  incoming: BlackjackServerSnapshot,
): boolean {
  if (!current) return true;
  if (incoming.revision > current.revision) return true;
  if (incoming.revision < current.revision) return false;
  return incoming.serverTimeMs >= current.serverTimeMs;
}

export class BlackjackServerClient {
  private snapshot: BlackjackServerSnapshot | null = null;
  private readonly listeners = new Set<BlackjackServerClientListener>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly unsubscribeBus: (() => void) | null;

  constructor(
    private readonly transport: BlackjackServerTransport = browserTransport,
    private readonly bus: BlackjackSnapshotBus | null = null,
  ) {
    this.unsubscribeBus = bus?.subscribe((snapshot) => {
      this.acceptSnapshot(snapshot, false);
    }) ?? null;
  }

  getSnapshot(): BlackjackServerSnapshot | null {
    return this.snapshot;
  }

  subscribe(listener: BlackjackServerClientListener): () => void {
    this.listeners.add(listener);
    if (this.snapshot) listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async connect(): Promise<BlackjackServerSnapshot> {
    const snapshot = await this.transport.fetchState();
    this.acceptSnapshot(snapshot, true);
    return this.snapshot ?? snapshot;
  }

  async refresh(): Promise<BlackjackServerSnapshot> {
    return this.connect();
  }

  action(
    action: BlackjackServerActionName,
    seats?: BlackjackDealSeat[],
  ): Promise<BlackjackServerSnapshot> {
    const operation = async () => {
      const current = this.snapshot ?? await this.connect();
      const request: BlackjackServerActionRequest = {
        expectedRevision: current.revision,
        idempotencyKey: this.transport.createIdempotencyKey(),
        action,
        ...(action === "deal" ? { seats } : {}),
      };

      try {
        const snapshot = await this.transport.sendAction(request);
        this.acceptSnapshot(snapshot, true);
        return snapshot;
      } catch (error) {
        if (
          error instanceof BlackjackServerApiError &&
          error.message === "BLACKJACK_STALE_REVISION"
        ) {
          const latest = error.snapshot ?? await this.transport.fetchState();
          this.acceptSnapshot(latest, true);
          throw new BlackjackStaleActionError(latest);
        }
        throw error;
      }
    };

    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  ingestExternalSnapshot(snapshot: BlackjackServerSnapshot): void {
    this.acceptSnapshot(snapshot, false);
  }

  destroy(): void {
    this.unsubscribeBus?.();
    this.listeners.clear();
  }

  private acceptSnapshot(
    snapshot: BlackjackServerSnapshot,
    publish: boolean,
  ): void {
    if (!shouldAcceptSnapshot(this.snapshot, snapshot)) return;
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
    if (publish) this.bus?.publish(snapshot);
  }
}

export function createBlackjackBroadcastSnapshotBus(
  channelName = "blackjack-authority-v1",
): BlackjackSnapshotBus | null {
  if (typeof BroadcastChannel === "undefined") return null;

  const channel = new BroadcastChannel(channelName);
  const listeners = new Set<(snapshot: BlackjackServerSnapshot) => void>();
  channel.addEventListener("message", (event: MessageEvent<BlackjackServerSnapshot>) => {
    const snapshot = event.data;
    if (!snapshot || typeof snapshot.revision !== "number") return;
    for (const listener of listeners) listener(snapshot);
  });

  return {
    publish(snapshot) {
      channel.postMessage(snapshot);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
