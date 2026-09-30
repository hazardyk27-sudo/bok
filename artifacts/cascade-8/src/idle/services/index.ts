import {
  TICKET_MICRO_UNITS,
} from "../config";
import type {
  IdleSeatPurchaseResponse,
  IdleSpeedUpgradeResponse,
  IdleStadiumLevelUpgradeResponse,
  IdleStadiumStateEnvelope,
  IdleStadiumStateResponse,
  IdleStorageUpgradeResponse,
  IdleTicketMarketCurrentResponse,
  IdleTicketMarketHistoryResponse,
  IdleTicketMarketLiveEvent,
  IdleTicketSaleResponse,
  TicketMarketSnapshot,
} from "../types";

const IDLE_STATE_ENDPOINT = "/api/idle/state";
const MILLISECONDS_PER_HOUR = 60 * 60 * 1_000;

async function readApiError(
  response: Response,
  fallback: string,
) {
  const body = await response.json().catch(
    () => null,
  ) as { error?: string } | null;

  return body?.error ?? fallback;
}

export class IdleRequestError extends Error {
  readonly outcomeUnknown: boolean;

  constructor(
    code: string,
    options: {
      outcomeUnknown?: boolean;
    } = {},
  ) {
    super(code);
    this.name = "IdleRequestError";
    this.outcomeUnknown =
      options.outcomeUnknown ?? false;
  }
}

async function postIdleJson<T>(
  endpoint: string,
  body: Record<string, unknown>,
  fallbackError: string,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new IdleRequestError(
      fallbackError,
      { outcomeUnknown: true },
    );
  }

  if (!response.ok) {
    const code =
      await readApiError(response, fallbackError);
    throw new IdleRequestError(code, {
      outcomeUnknown: response.status >= 500,
    });
  }

  try {
    return await response.json() as T;
  } catch {
    throw new IdleRequestError(
      fallbackError,
      { outcomeUnknown: true },
    );
  }
}

export async function fetchIdleStadiumState():
Promise<IdleStadiumStateEnvelope> {
  const response = await fetch(IDLE_STATE_ENDPOINT, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        "IDLE_STADIUM_STATE_REQUEST_FAILED",
      ),
    );
  }

  const snapshot =
    await response.json() as IdleStadiumStateResponse;

  return {
    snapshot,
    receivedAtMs: Date.now(),
  };
}

/**
 * Browser-only interpolation of the server-authoritative Stadium production.
 * The server snapshot remains the economy source of truth; this only animates
 * already-authorized production until the next refresh/action response.
 */
export function projectIdleStadiumLive(
  envelope: IdleStadiumStateEnvelope,
  nowMs = Date.now(),
) {
  const stadium = envelope.snapshot.stadium;
  const elapsedMs = Math.max(
    0,
    Math.floor(nowMs - envelope.receivedAtMs),
  );

  const possibleProduction =
    BigInt(stadium.productionRateMicroTicketsPerHour)
    * BigInt(elapsedMs)
    / BigInt(MILLISECONDS_PER_HOUR);

  const remainingBefore = BigInt(
    Math.max(0, stadium.remainingStorageMicroTickets),
  );
  const credited =
    possibleProduction < remainingBefore
      ? possibleProduction
      : remainingBefore;

  const liveStoredMicroTickets =
    stadium.storedMicroTickets + Number(credited);
  const liveRemainingStorageMicroTickets =
    Math.max(
      0,
      stadium.remainingStorageMicroTickets
        - Number(credited),
    );

  const storageCapacityMicroTickets =
    stadium.storageCapacityTickets
    * TICKET_MICRO_UNITS;
  const storageFillRatio =
    storageCapacityMicroTickets > 0
      ? Math.min(
        1,
        Math.max(
          0,
          liveStoredMicroTickets
            / storageCapacityMicroTickets,
        ),
      )
      : 0;

  const liveIsStorageFull =
    liveRemainingStorageMicroTickets === 0;
  const liveProductionStatus =
    stadium.ownedSeats <= 0
      ? "NO_SEATS" as const
      : liveIsStorageFull
        ? "STORAGE_FULL" as const
        : "PRODUCING" as const;

  return {
    ...stadium,
    liveStoredMicroTickets,
    liveRemainingStorageMicroTickets,
    liveIsStorageFull,
    liveProductionStatus,
    storageFillRatio,
  };
}

export async function buyIdleStadiumSeats(
  quantity: number,
  idempotencyKey: string,
) {
  return postIdleJson<IdleSeatPurchaseResponse>(
    "/api/idle/stadium/seats/buy",
    { quantity, idempotencyKey },
    "IDLE_SEAT_PURCHASE_REQUEST_FAILED",
  );
}

export async function upgradeIdleStadiumLevel(
  idempotencyKey: string,
) {
  return postIdleJson<IdleStadiumLevelUpgradeResponse>(
    "/api/idle/stadium/upgrade",
    { idempotencyKey },
    "IDLE_STADIUM_UPGRADE_REQUEST_FAILED",
  );
}

export async function upgradeIdleStadiumSpeed(
  idempotencyKey: string,
) {
  return postIdleJson<IdleSpeedUpgradeResponse>(
    "/api/idle/stadium/speed/upgrade",
    { idempotencyKey },
    "IDLE_SPEED_UPGRADE_REQUEST_FAILED",
  );
}

export async function upgradeIdleStadiumStorage(
  idempotencyKey: string,
) {
  return postIdleJson<IdleStorageUpgradeResponse>(
    "/api/idle/stadium/storage/upgrade",
    { idempotencyKey },
    "IDLE_STORAGE_UPGRADE_REQUEST_FAILED",
  );
}

export async function sellIdleStadiumTickets(
  quantityTickets: number,
  idempotencyKey: string,
) {
  return postIdleJson<IdleTicketSaleResponse>(
    "/api/idle/stadium/tickets/sell",
    { quantityTickets, idempotencyKey },
    "IDLE_TICKET_SALE_REQUEST_FAILED",
  );
}

export async function fetchIdleMarketCurrent() {
  const response = await fetch("/api/idle/market", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        "IDLE_MARKET_REQUEST_FAILED",
      ),
    );
  }

  return response.json() as Promise<
    IdleTicketMarketCurrentResponse
  >;
}

export async function fetchIdleMarketHistory() {
  const response = await fetch(
    "/api/idle/market/history",
    {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        "IDLE_MARKET_HISTORY_REQUEST_FAILED",
      ),
    );
  }

  return response.json() as Promise<
    IdleTicketMarketHistoryResponse
  >;
}

export function subscribeIdleMarket(
  onMarket: (market: TicketMarketSnapshot) => void,
  onError?: () => void,
) {
  const source = new EventSource(
    "/api/idle/market/live",
    { withCredentials: true },
  );

  const handleMarket = (event: MessageEvent<string>) => {
    try {
      const market = JSON.parse(
        event.data,
      ) as IdleTicketMarketLiveEvent;
      onMarket(market);
    } catch {
      onError?.();
    }
  };

  source.addEventListener(
    "market",
    handleMarket as EventListener,
  );
  source.addEventListener("error", () => {
    onError?.();
  });

  return () => {
    source.close();
  };
}
