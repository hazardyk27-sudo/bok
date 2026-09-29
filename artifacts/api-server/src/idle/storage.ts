// Persistent storage contract for the Idle / İşletmeler backend.
// The Drizzle table is implemented in @workspace/db; this file documents the
// backend invariants used by the repository layer that follows.

export const IDLE_BUSINESS_STATE_TABLE = "idle_business_states";

export const ACTIVE_IDLE_BUSINESS_IDS = ["stadium"] as const;
export type ActiveIdleBusinessId =
  (typeof ACTIVE_IDLE_BUSINESS_IDS)[number];

export const IDLE_BUSINESS_IDS = ["stadium", "club-store", "fan-club"] as const;
export type IdleBusinessId = (typeof IDLE_BUSINESS_IDS)[number];

/**
 * Club Store / Fan Club remain valid legacy storage identifiers only. They are
 * not active economy/API targets during the Stadium ticket-economy migration.
 */
export function isActiveIdleBusinessId(
  value: string,
): value is ActiveIdleBusinessId {
  return (ACTIVE_IDLE_BUSINESS_IDS as readonly string[]).includes(value);
}

/**
 * Fractional earnings are persisted as microcents so frequent checkpoints do
 * not repeatedly round away sub-cent passive income.
 *
 * 1 cent = 1,000,000 microcents.
 */
export const IDLE_MICROCENTS_PER_CENT = 1_000_000;

export type IdleBusinessStorageState = {
  id: string;
  sessionId: string;
  businessId: IdleBusinessId;
  /**
   * null = the business has not been purchased yet.
   * 0..8 = the currently active purchased business level.
   */
  businessLevel: number | null;
  /** Kasa level is always 1..6 and resets to 1 on a main business upgrade. */
  vaultLevel: number;
  /**
   * Banked passive income at checkpoint time, in microcents.
   * Live uncheckpointed income is derived from checkpointAt on the server.
   */
  accruedMicrocents: number;
  checkpointAt: Date;
  createdAt: Date;
  updatedAt: Date;
};
