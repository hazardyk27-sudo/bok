import { pool } from "@workspace/db";
import {
  SPEED_LEVELS,
  STADIUM_LEVELS,
  STORAGE_LEVELS,
} from "../../../cascade-8/src/idle/config";
import { quoteSeatPurchase } from "./seatPricing";

const FREE_STARTING_SEATS = 1_000;

export type IdleInvestmentProgress = {
  stadiumLevel: number;
  ownedSeats: number;
  speedLevel: number;
  storageLevel: number;
};

export type IdleLeaderboardSourceRow = {
  username: string;
  balanceCents: number;
  stadiumLevel: number | null;
  ownedSeats: number | null;
  speedLevel: number | null;
  storageLevel: number | null;
};

export type IdleLeaderboardEntry = {
  rank: number;
  username: string;
  cashCents: number;
  capitalCents: number;
  totalWealthCents: number;
};

function requireSafeNonNegativeInteger(
  value: number,
  errorCode: string,
) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(errorCode);
  }
  return value;
}

function requireProgressLevel(
  level: number,
  validLevels: readonly { level: number }[],
  errorCode: string,
) {
  if (!validLevels.some((entry) => entry.level === level)) {
    throw new Error(errorCode);
  }
  return level;
}

/**
 * Rebuilds invested business capital from the player's durable Stadium state.
 *
 * Action receipts intentionally cannot be used for wealth because they are
 * retained for only three days. Current progression is durable, so the full
 * investment remains reconstructable after receipt cleanup.
 *
 * The canonical product starts with Stadium Lv1, Speed Lv1, Storage Lv1 and
 * 1,000 free seats. Only money actually sunk beyond those free starting assets
 * is counted as capital.
 */
export function calculateInvestedCapitalCents(
  progress: IdleInvestmentProgress,
) {
  const stadiumLevel = requireProgressLevel(
    progress.stadiumLevel,
    STADIUM_LEVELS,
    "INVALID_IDLE_LEADERBOARD_STADIUM_LEVEL",
  );
  const speedLevel = requireProgressLevel(
    progress.speedLevel,
    SPEED_LEVELS,
    "INVALID_IDLE_LEADERBOARD_SPEED_LEVEL",
  );
  const storageLevel = requireProgressLevel(
    progress.storageLevel,
    STORAGE_LEVELS,
    "INVALID_IDLE_LEADERBOARD_STORAGE_LEVEL",
  );
  const ownedSeats = requireSafeNonNegativeInteger(
    progress.ownedSeats,
    "INVALID_IDLE_LEADERBOARD_SEAT_COUNT",
  );

  const stadiumCapitalCents = STADIUM_LEVELS.reduce(
    (sum, entry) =>
      entry.level > 1 && entry.level <= stadiumLevel
        ? sum + entry.unlockCostCents
        : sum,
    0,
  );

  const speedCapitalCents = SPEED_LEVELS.reduce(
    (sum, entry) =>
      entry.level > 1 && entry.level <= speedLevel
        ? sum + entry.upgradeCostCents
        : sum,
    0,
  );

  const storageCapitalCents = STORAGE_LEVELS.reduce(
    (sum, entry) =>
      entry.level > 1 && entry.level <= storageLevel
        ? sum + entry.upgradeCostCents
        : sum,
    0,
  );

  const paidSeatCount = Math.max(
    0,
    ownedSeats - FREE_STARTING_SEATS,
  );
  const seatCapitalCents = paidSeatCount > 0
    ? quoteSeatPurchase(
      FREE_STARTING_SEATS,
      paidSeatCount,
    ).totalCostCents
    : 0;

  return requireSafeNonNegativeInteger(
    stadiumCapitalCents
      + speedCapitalCents
      + storageCapitalCents
      + seatCapitalCents,
    "INVALID_IDLE_LEADERBOARD_CAPITAL",
  );
}

export function buildIdleLeaderboard(
  rows: IdleLeaderboardSourceRow[],
): IdleLeaderboardEntry[] {
  const ranked = rows.map((row) => {
    const cashCents = requireSafeNonNegativeInteger(
      row.balanceCents,
      "INVALID_IDLE_LEADERBOARD_CASH",
    );

    const capitalCents = calculateInvestedCapitalCents({
      stadiumLevel: row.stadiumLevel ?? 1,
      ownedSeats: row.ownedSeats ?? 0,
      speedLevel: row.speedLevel ?? 1,
      storageLevel: row.storageLevel ?? 1,
    });
    const totalWealthCents = requireSafeNonNegativeInteger(
      cashCents + capitalCents,
      "INVALID_IDLE_LEADERBOARD_WEALTH",
    );

    return {
      rank: 0,
      username: row.username,
      cashCents,
      capitalCents,
      totalWealthCents,
    };
  });

  ranked.sort((a, b) =>
    b.totalWealthCents - a.totalWealthCents
    || b.capitalCents - a.capitalCents
    || b.cashCents - a.cashCents
    || a.username.localeCompare(b.username),
  );

  return ranked.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

export async function getIdleLeaderboard() {
  const result = await pool.query<{
    username: string;
    balance_cents: string | number;
    stadium_level: string | number | null;
    owned_seats: string | number | null;
    speed_level: string | number | null;
    storage_level: string | number | null;
  }>(
    `SELECT
       u.username,
       w.balance_cents,
       s.stadium_level,
       s.owned_seats,
       s.speed_level,
       s.storage_level
     FROM users u
     JOIN shared_wallets w
       ON w.session_id = u.wallet_session_id
     LEFT JOIN idle_stadium_states s
       ON s.session_id = u.wallet_session_id`,
  );

  const entries = buildIdleLeaderboard(
    result.rows.map((row) => ({
      username: row.username,
      balanceCents: Number(row.balance_cents),
      stadiumLevel: row.stadium_level === null
        ? null
        : Number(row.stadium_level),
      ownedSeats: row.owned_seats === null
        ? null
        : Number(row.owned_seats),
      speedLevel: row.speed_level === null
        ? null
        : Number(row.speed_level),
      storageLevel: row.storage_level === null
        ? null
        : Number(row.storage_level),
    })),
  );

  return {
    serverTime: new Date().toISOString(),
    totalPlayers: entries.length,
    entries,
  };
}
