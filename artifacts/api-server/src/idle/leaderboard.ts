import { pool } from "@workspace/db";
export {
  calculateInvestedCapitalCents,
} from "./investmentCapital";

export type IdleLeaderboardSourceRow = {
  username: string;
  balanceCents: number;
  investedCapitalCents: number;
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

export function buildIdleLeaderboard(
  rows: IdleLeaderboardSourceRow[],
): IdleLeaderboardEntry[] {
  const ranked = rows.map((row) => {
    const cashCents = requireSafeNonNegativeInteger(
      row.balanceCents,
      "INVALID_IDLE_LEADERBOARD_CASH",
    );
    const capitalCents = requireSafeNonNegativeInteger(
      row.investedCapitalCents,
      "INVALID_IDLE_LEADERBOARD_CAPITAL",
    );
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
    invested_capital_cents: string | number;
  }>(
    `SELECT
       u.username,
       w.balance_cents,
       COALESCE(i.invested_capital_cents, 0) AS invested_capital_cents
     FROM users u
     JOIN shared_wallets w
       ON w.session_id = u.wallet_session_id
     LEFT JOIN (
       SELECT session_id,
              SUM(amount_cents) AS invested_capital_cents
         FROM idle_investment_ledger
        GROUP BY session_id
     ) i
       ON i.session_id = u.wallet_session_id`,
  );

  const entries = buildIdleLeaderboard(
    result.rows.map((row) => ({
      username: row.username,
      balanceCents: Number(row.balance_cents),
      investedCapitalCents:
        Number(row.invested_capital_cents),
    })),
  );

  return {
    serverTime: new Date().toISOString(),
    totalPlayers: entries.length,
    entries,
  };
}
