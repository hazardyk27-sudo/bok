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

  constructor(
    private readonly transport: BlackjackServerTransport = browserTransport,
  ) {}

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
    this.acceptSnapshot(snapshot);
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
        this.acceptSnapshot(snapshot);
        return snapshot;
      } catch (error) {
        if (
          error instanceof BlackjackServerApiError &&
          error.message === "BLACKJACK_STALE_REVISION"
        ) {
          const latest = error.snapshot ?? await this.transport.fetchState();
          this.acceptSnapshot(latest);
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

  destroy(): void {
    this.listeners.clear();
  }

  private acceptSnapshot(snapshot: BlackjackServerSnapshot): void {
    if (!shouldAcceptSnapshot(this.snapshot, snapshot)) return;
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

export function installBlackjackReconnectListeners(
  client: BlackjackServerClient,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const refresh = () => {
    void client.refresh().catch(() => {
      // Keep the last authoritative snapshot visible during a temporary outage.
      // The next focus/pageshow/online event will attempt another GET resync.
    });
  };

  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  window.addEventListener("online", refresh);

  return () => {
    window.removeEventListener("focus", refresh);
    window.removeEventListener("pageshow", refresh);
    window.removeEventListener("online", refresh);
  };
}
