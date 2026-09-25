import {
  CLUB_STORE_BUSINESS,
  FAN_CLUB_BUSINESS,
  STADIUM_BUSINESS,
} from "../config";
import type {
  BusinessDefinition,
  BusinessId,
  IdleBusinessServerState,
  IdleCollectResponse,
  IdleLiveBusinessState,
  IdleStateEnvelope,
  IdleStateResponse,
} from "../types";
import { MILLISECONDS_PER_DAY } from "../utils";

const IDLE_STATE_ENDPOINT = "/api/idle/state";
const MICRO_CENTS_PER_CENT = 1_000_000;

function getBusinessDefinition(businessId: BusinessId): BusinessDefinition {
  switch (businessId) {
    case "stadium":
      return STADIUM_BUSINESS;
    case "club-store":
      return CLUB_STORE_BUSINESS;
    case "fan-club":
      return FAN_CLUB_BUSINESS;
  }
}

function getExactEarnedMicrocents(dailyIncomeCents: number, elapsedMs: number) {
  const safeElapsedMs = Math.max(0, Math.floor(elapsedMs));
  if (dailyIncomeCents <= 0 || safeElapsedMs <= 0) return 0;

  const numerator = BigInt(dailyIncomeCents)
    * BigInt(MICRO_CENTS_PER_CENT)
    * BigInt(safeElapsedMs);
  return Number(numerator / BigInt(MILLISECONDS_PER_DAY));
}

export async function fetchIdleState(): Promise<IdleStateEnvelope> {
  const response = await fetch(IDLE_STATE_ENDPOINT, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("IDLE_STATE_REQUEST_FAILED");
  }

  const snapshot = await response.json() as IdleStateResponse;
  return {
    snapshot,
    receivedAtMs: Date.now(),
  };
}

/**
 * Projects one business forward from a server-authoritative snapshot.
 * The projection is display-only: it never writes economy state and always
 * caps at the server-provided remaining vault capacity.
 */
export function projectIdleBusinessLive(
  business: IdleBusinessServerState,
  elapsedSinceSnapshotMs: number,
): IdleLiveBusinessState {
  if (business.businessLevel === null) {
    return {
      ...business,
      liveAccruedMicrocents: 0,
      liveRemainingCapacityMicrocents: 0,
      liveIsVaultFull: false,
      vaultFillRatio: 0,
      vaultStatus: "UNOWNED",
      collectableCents: 0,
      canCollect: false,
    };
  }

  if (business.isVaultFull) {
    const collectableCents = Math.floor(
      business.accruedMicrocents / MICRO_CENTS_PER_CENT,
    );
    return {
      ...business,
      liveAccruedMicrocents: business.accruedMicrocents,
      liveRemainingCapacityMicrocents: 0,
      liveIsVaultFull: true,
      vaultFillRatio: 1,
      vaultStatus: "FULL",
      collectableCents,
      canCollect: collectableCents > 0,
    };
  }

  const definition = getBusinessDefinition(business.businessId);
  const level = definition.levels.find((entry) => entry.level === business.businessLevel);
  if (!level) throw new Error("INVALID_IDLE_BUSINESS_LEVEL");

  const earnedMicrocents = getExactEarnedMicrocents(
    level.dailyIncomeCents,
    elapsedSinceSnapshotMs,
  );
  const creditedMicrocents = Math.min(
    Math.max(0, business.remainingCapacityMicrocents),
    earnedMicrocents,
  );
  const liveAccruedMicrocents = Math.min(
    business.vaultCapacityMicrocents,
    business.accruedMicrocents + creditedMicrocents,
  );
  const liveRemainingCapacityMicrocents = Math.max(
    0,
    business.vaultCapacityMicrocents - liveAccruedMicrocents,
  );

  const liveIsVaultFull = liveRemainingCapacityMicrocents === 0;
  const vaultFillRatio = business.vaultCapacityMicrocents > 0
    ? Math.min(1, Math.max(0, liveAccruedMicrocents / business.vaultCapacityMicrocents))
    : 0;
  const collectableCents = Math.floor(
    liveAccruedMicrocents / MICRO_CENTS_PER_CENT,
  );

  return {
    ...business,
    liveAccruedMicrocents,
    liveRemainingCapacityMicrocents,
    liveIsVaultFull,
    vaultFillRatio,
    vaultStatus: liveIsVaultFull ? "FULL" : "EARNING",
    collectableCents,
    canCollect: collectableCents > 0,
  };
}

/**
 * Uses time elapsed on this browser since the response arrived instead of the
 * device wall clock versus serverTime, so clock skew cannot mint display income.
 */
export function projectIdleStateLive(
  envelope: IdleStateEnvelope,
  nowMs = Date.now(),
) {
  const elapsedSinceSnapshotMs = Math.max(
    0,
    Math.floor(nowMs - envelope.receivedAtMs),
  );

  return {
    ...envelope.snapshot,
    businesses: envelope.snapshot.businesses.map((business) =>
      projectIdleBusinessLive(business, elapsedSinceSnapshotMs),
    ),
  };
}


export async function collectIdleBusiness(
  businessId: BusinessId,
  idempotencyKey = crypto.randomUUID(),
): Promise<IdleCollectResponse> {
  const response = await fetch(
    `/api/idle/businesses/${encodeURIComponent(businessId)}/collect`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idempotencyKey }),
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "IDLE_COLLECT_REQUEST_FAILED");
  }

  return response.json() as Promise<IdleCollectResponse>;
}
