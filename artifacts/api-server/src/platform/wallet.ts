import { pool, type PoolClient } from "@workspace/db";
import { chooseSessionIdForWalletMigration } from "./session";

export const INITIAL_SHARED_BALANCE_CENTS = 100_000;
export const SHARED_WALLET_TABLE = "shared_wallets" as const;
export const LEGACY_WALLET_TABLE = "roulette_wallets" as const;

export type SharedWalletInitializationResult = {
  legacyImportedCount: number;
  legacyRepairedDefaultCount: number;
  legacyPreservedCount: number;
  ledgerRecoveredCount: number;
};

type WalletBalanceRow = {
  session_id: string;
  balance_cents: number | string;
};

async function ensureLegacyImportStorage(client: PoolClient) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS shared_wallet_legacy_imports (
       session_id TEXT PRIMARY KEY,
       legacy_balance_cents BIGINT NOT NULL,
       applied_balance_cents BIGINT NOT NULL,
       disposition TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}

async function legacyWalletTableExists(client: PoolClient) {
  const result = await client.query<{ relation: string | null }>(
    "SELECT to_regclass($1)::text AS relation",
    [LEGACY_WALLET_TABLE],
  );
  return Boolean(result.rows[0]?.relation);
}

async function importLegacyWallets(client: PoolClient) {
  if (!(await legacyWalletTableExists(client))) {
    return {
      legacyImportedCount: 0,
      legacyRepairedDefaultCount: 0,
      legacyPreservedCount: 0,
    };
  }

  const imported = await client.query(
    `WITH imported AS (
       INSERT INTO shared_wallets (session_id, balance_cents, updated_at)
       SELECT legacy.session_id, legacy.balance_cents::bigint, now()
         FROM roulette_wallets legacy
         LEFT JOIN shared_wallets shared USING (session_id)
         LEFT JOIN shared_wallet_legacy_imports receipt USING (session_id)
        WHERE shared.session_id IS NULL
          AND receipt.session_id IS NULL
       ON CONFLICT (session_id) DO NOTHING
       RETURNING session_id, balance_cents
     )
     INSERT INTO shared_wallet_legacy_imports
       (session_id, legacy_balance_cents, applied_balance_cents, disposition)
     SELECT session_id, balance_cents, balance_cents, 'IMPORTED_MISSING_SHARED'
       FROM imported
     ON CONFLICT (session_id) DO NOTHING
     RETURNING session_id`,
  );

  const repaired = await client.query(
    `WITH repaired AS (
       UPDATE shared_wallets shared
          SET balance_cents = legacy.balance_cents::bigint,
              updated_at = now()
         FROM roulette_wallets legacy
         LEFT JOIN shared_wallet_legacy_imports receipt
           ON receipt.session_id = legacy.session_id
        WHERE shared.session_id = legacy.session_id
          AND receipt.session_id IS NULL
          AND shared.balance_cents = $1::bigint
          AND legacy.balance_cents::bigint <> $1::bigint
       RETURNING shared.session_id, shared.balance_cents
     )
     INSERT INTO shared_wallet_legacy_imports
       (session_id, legacy_balance_cents, applied_balance_cents, disposition)
     SELECT session_id, balance_cents, balance_cents, 'REPAIRED_DEFAULT_SHARED'
       FROM repaired
     ON CONFLICT (session_id) DO NOTHING
     RETURNING session_id`,
    [INITIAL_SHARED_BALANCE_CENTS],
  );

  const preserved = await client.query(
    `INSERT INTO shared_wallet_legacy_imports
       (session_id, legacy_balance_cents, applied_balance_cents, disposition)
     SELECT legacy.session_id,
            legacy.balance_cents::bigint,
            shared.balance_cents::bigint,
            'PRESERVED_EXISTING_SHARED'
       FROM roulette_wallets legacy
       JOIN shared_wallets shared USING (session_id)
       LEFT JOIN shared_wallet_legacy_imports receipt USING (session_id)
      WHERE receipt.session_id IS NULL
     ON CONFLICT (session_id) DO NOTHING
     RETURNING session_id`,
  );

  return {
    legacyImportedCount: imported.rowCount ?? 0,
    legacyRepairedDefaultCount: repaired.rowCount ?? 0,
    legacyPreservedCount: preserved.rowCount ?? 0,
  };
}

async function recoverMissingSharedWalletsFromLedgers(client: PoolClient) {
  const recovery = await client.query<{
    negative_count: string;
    inserted_count: string;
  }>(
    `WITH sessions AS (
       SELECT session_id FROM slot_ledger
       UNION
       SELECT session_id FROM cadi_kazan_ledger
       UNION
       SELECT session_id FROM idle_ledger
       UNION
       SELECT session_id FROM idle_business_states
       UNION
       SELECT session_id FROM idle_action_receipts
       UNION
       SELECT session_id FROM slot_rounds
       UNION
       SELECT session_id FROM slot_wallet_migrations
       UNION
       SELECT session_id FROM cadi_kazan_rounds
     ),
     slot_totals AS (
       SELECT session_id, COALESCE(SUM(amount_cents), 0)::bigint AS delta_cents
         FROM slot_ledger
        GROUP BY session_id
     ),
     cadi_totals AS (
       SELECT session_id, COALESCE(SUM(amount_cents), 0)::bigint AS delta_cents
         FROM cadi_kazan_ledger
        GROUP BY session_id
     ),
     idle_totals AS (
       SELECT session_id, COALESCE(SUM(amount_cents), 0)::bigint AS delta_cents
         FROM idle_ledger
        GROUP BY session_id
     ),
     candidates AS (
       SELECT sessions.session_id,
              (
                $1::bigint
                + COALESCE(slot_totals.delta_cents, 0)
                + COALESCE(cadi_totals.delta_cents, 0)
                + COALESCE(idle_totals.delta_cents, 0)
              )::bigint AS balance_cents
         FROM sessions
         LEFT JOIN slot_totals USING (session_id)
         LEFT JOIN cadi_totals USING (session_id)
         LEFT JOIN idle_totals USING (session_id)
         LEFT JOIN shared_wallets shared USING (session_id)
        WHERE shared.session_id IS NULL
     ),
     negative AS (
       SELECT count(*)::bigint AS count
         FROM candidates
        WHERE balance_cents < 0
     ),
     inserted AS (
       INSERT INTO shared_wallets (session_id, balance_cents, updated_at)
       SELECT session_id, balance_cents, now()
         FROM candidates
        WHERE (SELECT count FROM negative) = 0
       ON CONFLICT (session_id) DO NOTHING
       RETURNING session_id
     )
     SELECT
       (SELECT count::text FROM negative) AS negative_count,
       (SELECT count(*)::text FROM inserted) AS inserted_count`,
    [INITIAL_SHARED_BALANCE_CENTS],
  );

  const negativeCount = Number(recovery.rows[0]?.negative_count ?? "0");
  if (negativeCount > 0) {
    throw new Error("SHARED_WALLET_RECOVERY_NEGATIVE_BALANCE");
  }

  return Number(recovery.rows[0]?.inserted_count ?? "0");
}

export async function initializeSharedWalletPlatform(): Promise<SharedWalletInitializationResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('shared-wallet-platform-v2', 0))",
    );

    await ensureLegacyImportStorage(client);
    const legacy = await importLegacyWallets(client);
    const ledgerRecoveredCount = await recoverMissingSharedWalletsFromLedgers(client);

    await client.query("COMMIT");
    return {
      ...legacy,
      ledgerRecoveredCount,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function recoverSharedWalletsIfEmpty() {
  const result = await initializeSharedWalletPlatform();
  const insertedCount =
    result.legacyImportedCount
    + result.legacyRepairedDefaultCount
    + result.ledgerRecoveredCount;

  return {
    recovered: insertedCount > 0,
    insertedCount,
  };
}

export async function resolveCanonicalWalletSessionCandidates(
  candidateSessionIds: readonly string[],
  legacySessionId: string | null,
) {
  const candidates = [...new Set(candidateSessionIds)];
  const lookupIds = [...candidates];
  if (legacySessionId && !lookupIds.includes(legacySessionId)) {
    lookupIds.push(legacySessionId);
  }

  if (lookupIds.length === 0) return null;

  const result = await pool.query<WalletBalanceRow>(
    `SELECT session_id, balance_cents
       FROM shared_wallets
      WHERE session_id = ANY($1::text[])`,
    [lookupIds],
  );

  const balances = new Map(
    result.rows.map((row) => [row.session_id, Number(row.balance_cents)]),
  );

  const existingCandidates = candidates.filter((sessionId) =>
    balances.has(sessionId),
  );

  const canonicalSessionId = existingCandidates
    .map((sessionId, order) => ({
      sessionId,
      order,
      balanceCents: balances.get(sessionId) ?? INITIAL_SHARED_BALANCE_CENTS,
    }))
    .sort((left, right) =>
      right.balanceCents - left.balanceCents || right.order - left.order,
    )
    .at(0)?.sessionId
    ?? candidates.at(-1)
    ?? null;

  if (!canonicalSessionId) return legacySessionId;

  return chooseSessionIdForWalletMigration({
    canonicalSessionId,
    legacySessionId,
    canonicalBalanceCents: balances.get(canonicalSessionId) ?? null,
    legacyBalanceCents: legacySessionId
      ? balances.get(legacySessionId) ?? null
      : null,
    initialBalanceCents: INITIAL_SHARED_BALANCE_CENTS,
  });
}

export async function resolveCanonicalWalletSessionId(
  canonicalSessionId: string | null,
  legacySessionId: string | null,
) {
  return resolveCanonicalWalletSessionCandidates(
    canonicalSessionId ? [canonicalSessionId] : [],
    legacySessionId,
  );
}