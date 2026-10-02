import { randomInt, randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { INITIAL_SHARED_BALANCE_CENTS } from "../platform/wallet";
import {
  OFFICE_MATCH_SYMBOLS,
  OFFICE_POOL_DISTRIBUTION,
  OFFICE_POOL_SIZE,
  createOfficePoolTickets,
  resolveOfficeMatchReveal,
  type OfficeMatchSymbolId,
} from "./officeMatch";
import {
  ADVANCED_ALARM_OPTIONS,
  CADI_KAZAN_MIN_STAKE_CENTS,
  CADI_KAZAN_MODES,
  type CadiKazanMode,
  type CadiKazanOfficePoolStatus,
  type CadiKazanRoundSnapshot,
  type CadiKazanState,
  type CadiKazanStatus,
  getCashoutMultiplierBps,
  getCashoutPayoutCents,
  getCellCount,
  getMaxSafeStakeCents,
  getSafeCellCount,
  getVisibleBombCells,
  getVisibleOfficeCells,
  getVisibleRevealedCells,
  getPreparedReveal,
} from "./types";

type CadiRoundRow = {
  id: string;
  session_id: string;
  mode: CadiKazanMode;
  alarm_count: number;
  cell_count: number;
  stake_cents: number;
  bomb_indices: unknown;
  office_cells: unknown;
  office_pool_id: string | null;
  office_ticket_id: string | null;
  office_ticket_public_id: string | null;
  office_pool_remaining: number | null;
  revealed_cells: unknown;
  revealed_safe_count: number;
  current_multiplier_bps: number;
  status: CadiKazanStatus;
  payout_cents: number;
  start_idempotency_key: string;
  cashout_idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
};

type WalletRow = { balance_cents: number };
type CadiActionRow = { session_id: string; round_id: string; kind: string };
type OfficePoolRow = {
  id: string;
  pool_number: number;
  status: "ACTIVE" | "READY" | "EXHAUSTED";
};
type OfficeTicketRow = {
  id: string;
  public_id: string;
  pool_id: string;
  draw_order: number;
  outcome_symbol: OfficeMatchSymbolId | null;
  multiplier_bps: number;
  office_cells: unknown;
};
type RevealContextRow = CadiRoundRow & {
  action_session_id: string | null;
  action_round_id: string | null;
  action_kind: string | null;
  wallet_balance_cents: number | null;
};

const safeNumberArray = (value: unknown) => (Array.isArray(value) ? value.map(Number).filter(Number.isInteger) : []);
const officeSymbolIds = new Set<OfficeMatchSymbolId>(OFFICE_MATCH_SYMBOLS.map((symbol) => symbol.id));
const safeOfficeSymbolArray = (value: unknown): OfficeMatchSymbolId[] => (
  Array.isArray(value)
    ? value.filter((item): item is OfficeMatchSymbolId => typeof item === "string" && officeSymbolIds.has(item as OfficeMatchSymbolId))
    : []
);
const asIso = (value: Date) => value.toISOString();

let bigMoneyStorageReady: Promise<void> | null = null;

async function ensureBigMoneyStorage() {
  if (bigMoneyStorageReady) return bigMoneyStorageReady;
  bigMoneyStorageReady = (async () => {
    await pool.query("ALTER TABLE cadi_kazan_rounds ADD COLUMN IF NOT EXISTS office_cells JSONB");
    await pool.query("ALTER TABLE cadi_kazan_rounds ADD COLUMN IF NOT EXISTS office_pool_id TEXT");
    await pool.query("ALTER TABLE cadi_kazan_rounds ADD COLUMN IF NOT EXISTS office_ticket_id TEXT");
    await pool.query("ALTER TABLE cadi_kazan_rounds ADD COLUMN IF NOT EXISTS office_ticket_public_id TEXT");
    await pool.query("ALTER TABLE cadi_kazan_rounds ADD COLUMN IF NOT EXISTS office_pool_remaining INTEGER");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cadi_kazan_office_pools (
        id TEXT PRIMARY KEY,
        pool_number INTEGER NOT NULL UNIQUE,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        activated_at TIMESTAMPTZ,
        exhausted_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cadi_kazan_office_tickets (
        id TEXT PRIMARY KEY,
        public_id TEXT NOT NULL UNIQUE,
        pool_id TEXT NOT NULL,
        draw_order INTEGER NOT NULL,
        outcome_symbol TEXT,
        multiplier_bps INTEGER NOT NULL,
        office_cells JSONB NOT NULL,
        claimed_round_id TEXT,
        claimed_session_id TEXT,
        claimed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (pool_id, draw_order)
      )
    `);
    await pool.query("CREATE INDEX IF NOT EXISTS cadi_kazan_office_pools_status_idx ON cadi_kazan_office_pools (status, pool_number)");
    await pool.query("CREATE INDEX IF NOT EXISTS cadi_kazan_office_tickets_pool_claim_idx ON cadi_kazan_office_tickets (pool_id, claimed_round_id, draw_order)");
    const expected = new Map([
      ["shared_wallets.balance_cents", "BIGINT"],
      ["cadi_kazan_rounds.stake_cents", "BIGINT"],
      ["cadi_kazan_rounds.payout_cents", "BIGINT"],
      ["cadi_kazan_ledger.amount_cents", "BIGINT"],
    ]);
    const result = await pool.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (
            (table_name = 'shared_wallets' AND column_name = 'balance_cents')
            OR (table_name = 'cadi_kazan_rounds' AND column_name IN ('stake_cents', 'payout_cents'))
            OR (table_name = 'cadi_kazan_ledger' AND column_name = 'amount_cents')
          )`,
    );
    const current = new Map(result.rows.map((row) => [`${row.table_name}.${row.column_name}`, row.data_type.toUpperCase()]));
    const statements = [
      ["shared_wallets.balance_cents", "ALTER TABLE shared_wallets ALTER COLUMN balance_cents TYPE BIGINT USING balance_cents::BIGINT"],
      ["cadi_kazan_rounds.stake_cents", "ALTER TABLE cadi_kazan_rounds ALTER COLUMN stake_cents TYPE BIGINT USING stake_cents::BIGINT"],
      ["cadi_kazan_rounds.payout_cents", "ALTER TABLE cadi_kazan_rounds ALTER COLUMN payout_cents TYPE BIGINT USING payout_cents::BIGINT"],
      ["cadi_kazan_ledger.amount_cents", "ALTER TABLE cadi_kazan_ledger ALTER COLUMN amount_cents TYPE BIGINT USING amount_cents::BIGINT"],
    ] as const;
    const pending = statements.filter(([key]) => current.get(key) !== expected.get(key));
    if (pending.length === 0) return;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [, sql] of pending) await client.query(sql);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })().catch((error) => {
    bigMoneyStorageReady = null;
    throw error;
  });
  return bigMoneyStorageReady;
}

function validateRoundInput(input: {
  mode: CadiKazanMode;
  alarmCount: number;
  stakeCents: number;
}) {
  if (!CADI_KAZAN_MODES.includes(input.mode)) throw new Error("INVALID_CADI_KAZAN_MODE");
  if (!Number.isSafeInteger(input.stakeCents) || input.stakeCents < CADI_KAZAN_MIN_STAKE_CENTS) {
    throw new Error("CADI_KAZAN_STAKE_OUT_OF_RANGE");
  }
  if (input.stakeCents > getMaxSafeStakeCents(input.mode, input.alarmCount)) {
    throw new Error("CADI_KAZAN_STAKE_STORAGE_LIMIT");
  }
  if (input.mode === "STANDARD" && input.alarmCount !== 1) throw new Error("STANDARD_REQUIRES_ONE_BOMB");
  if (input.mode === "ADVANCED" && !ADVANCED_ALARM_OPTIONS.includes(input.alarmCount as (typeof ADVANCED_ALARM_OPTIONS)[number])) {
    throw new Error("INVALID_ADVANCED_ALARM_COUNT");
  }
  if (input.mode === "OFFICE_MATCH_6" && input.alarmCount !== 0) throw new Error("OFFICE_MATCH_REQUIRES_ZERO_BOMBS");
}

function chooseBombIndices(cellCount: number, alarmCount: number) {
  const selected = new Set<number>();
  while (selected.size < alarmCount) selected.add(randomInt(0, cellCount));
  return [...selected].sort((a, b) => a - b);
}

function toSnapshot(row: CadiRoundRow): CadiKazanRoundSnapshot {
  const bombIndices = safeNumberArray(row.bomb_indices);
  const officeCells = safeOfficeSymbolArray(row.office_cells);
  const revealedCells = safeNumberArray(row.revealed_cells);
  const visibleRevealedCells = getVisibleRevealedCells(
    row.mode,
    row.status,
    Number(row.cell_count),
    revealedCells,
  );
  return {
    id: row.id,
    mode: row.mode,
    alarmCount: Number(row.alarm_count),
    cellCount: Number(row.cell_count),
    stakeCents: Number(row.stake_cents),
    revealedCells: visibleRevealedCells,
    revealedSafeCount: Number(row.revealed_safe_count),
    currentMultiplierBps: Number(row.current_multiplier_bps),
    currentCashoutCents: getCashoutPayoutCents(Number(row.stake_cents), Number(row.current_multiplier_bps)),
    status: row.status,
    payoutCents: Number(row.payout_cents),
    revealedBombCells: getVisibleBombCells(row.status, bombIndices),
    revealedOfficeCells: getVisibleOfficeCells(row.status, revealedCells, officeCells),
    officeTicketPublicId: row.office_ticket_public_id ?? null,
    officePoolRemaining: row.office_pool_remaining === null ? null : Number(row.office_pool_remaining),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

const OFFICE_POOL_ADVISORY_LOCK = 2_607_075;

function createOfficePublicTicketId() {
  return `OFF-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

async function createOfficePool(client: PoolClient, status: "ACTIVE" | "READY") {
  const numberResult = await client.query<{ next_pool_number: number }>(
    "SELECT COALESCE(MAX(pool_number), 0) + 1 AS next_pool_number FROM cadi_kazan_office_pools",
  );
  const poolNumber = Number(numberResult.rows[0]?.next_pool_number ?? 1);
  const poolId = randomUUID();
  await client.query(
    `INSERT INTO cadi_kazan_office_pools
      (id, pool_number, status, activated_at)
     VALUES ($1, $2, $3, CASE WHEN $3 = 'ACTIVE' THEN now() ELSE NULL END)`,
    [poolId, poolNumber, status],
  );

  const tickets = createOfficePoolTickets().map((ticket, index) => ({
    id: randomUUID(),
    publicId: createOfficePublicTicketId(),
    drawOrder: index + 1,
    outcomeSymbol: ticket.outcome.symbolId,
    multiplierBps: ticket.outcome.multiplierBps,
    officeCells: ticket.cells,
  }));
  await client.query(
    `INSERT INTO cadi_kazan_office_tickets
      (id, public_id, pool_id, draw_order, outcome_symbol, multiplier_bps, office_cells)
     SELECT x.id, x.public_id, $2, x.draw_order, x.outcome_symbol, x.multiplier_bps, x.office_cells
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id TEXT,
         public_id TEXT,
         draw_order INTEGER,
         outcome_symbol TEXT,
         multiplier_bps INTEGER,
         office_cells JSONB
       )`,
    [JSON.stringify(tickets.map((ticket) => ({
      id: ticket.id,
      public_id: ticket.publicId,
      draw_order: ticket.drawOrder,
      outcome_symbol: ticket.outcomeSymbol,
      multiplier_bps: ticket.multiplierBps,
      office_cells: ticket.officeCells,
    }))), poolId],
  );

  return { id: poolId, pool_number: poolNumber, status } satisfies OfficePoolRow;
}

async function getOfficePoolRemaining(client: PoolClient, poolId: string) {
  const result = await client.query<{ remaining: number }>(
    "SELECT COUNT(*)::int AS remaining FROM cadi_kazan_office_tickets WHERE pool_id = $1 AND claimed_round_id IS NULL",
    [poolId],
  );
  return Number(result.rows[0]?.remaining ?? 0);
}

async function isOfficePoolCurrent(client: PoolClient, poolId: string) {
  const result = await client.query<{ outcome_symbol: OfficeMatchSymbolId | null; multiplier_bps: number; count: number }>(
    `SELECT outcome_symbol, multiplier_bps, COUNT(*)::int AS count
       FROM cadi_kazan_office_tickets
      WHERE pool_id = $1
      GROUP BY outcome_symbol, multiplier_bps`,
    [poolId],
  );

  const expected = new Map(
    OFFICE_POOL_DISTRIBUTION.map((entry) => [
      `${entry.symbolId ?? "LOSS"}:${entry.multiplierBps}`,
      entry.count,
    ] as const),
  );
  const actual = new Map(
    result.rows.map((row) => [
      `${row.outcome_symbol ?? "LOSS"}:${Number(row.multiplier_bps)}`,
      Number(row.count),
    ] as const),
  );

  return actual.size === expected.size
    && [...expected.entries()].every(([key, count]) => actual.get(key) === count);
}

async function retireLegacyOfficePools(client: PoolClient) {
  const candidates = await client.query<OfficePoolRow>(
    "SELECT id, pool_number, status FROM cadi_kazan_office_pools WHERE status IN ('ACTIVE', 'READY') ORDER BY pool_number FOR UPDATE",
  );
  for (const candidate of candidates.rows) {
    if (await isOfficePoolCurrent(client, candidate.id)) continue;
    await client.query(
      "UPDATE cadi_kazan_office_pools SET status = 'EXHAUSTED', exhausted_at = COALESCE(exhausted_at, now()) WHERE id = $1",
      [candidate.id],
    );
  }
}

async function ensureOfficePoolSupply(client: PoolClient): Promise<OfficePoolRow> {
  await client.query("SELECT pg_advisory_xact_lock($1)", [OFFICE_POOL_ADVISORY_LOCK]);

  await retireLegacyOfficePools(client);

  let active: OfficePoolRow | null = (
    await client.query<OfficePoolRow>(
      "SELECT id, pool_number, status FROM cadi_kazan_office_pools WHERE status = 'ACTIVE' ORDER BY pool_number LIMIT 1 FOR UPDATE",
    )
  ).rows[0] ?? null;

  if (active && await getOfficePoolRemaining(client, active.id) === 0) {
    await client.query(
      "UPDATE cadi_kazan_office_pools SET status = 'EXHAUSTED', exhausted_at = COALESCE(exhausted_at, now()) WHERE id = $1",
      [active.id],
    );
    active = null;
  }

  if (!active) {
    const ready = (
      await client.query<OfficePoolRow>(
        "SELECT id, pool_number, status FROM cadi_kazan_office_pools WHERE status = 'READY' ORDER BY pool_number LIMIT 1 FOR UPDATE",
      )
    ).rows[0] ?? null;
    if (ready) {
      await client.query(
        "UPDATE cadi_kazan_office_pools SET status = 'ACTIVE', activated_at = COALESCE(activated_at, now()) WHERE id = $1",
        [ready.id],
      );
      active = { ...ready, status: "ACTIVE" };
    } else {
      active = await createOfficePool(client, "ACTIVE");
    }
  }

  const readyExists = (
    await client.query<{ id: string }>(
      "SELECT id FROM cadi_kazan_office_pools WHERE status = 'READY' AND pool_number > $1 ORDER BY pool_number LIMIT 1",
      [active.pool_number],
    )
  ).rows[0];
  if (!readyExists) await createOfficePool(client, "READY");

  return active;
}

async function claimOfficeTicket(
  client: PoolClient,
  roundId: string,
  sessionId: string,
): Promise<{ ticket: OfficeTicketRow; remaining: number }> {
  let active = await ensureOfficePoolSupply(client);

  let ticket = (
    await client.query<OfficeTicketRow>(
      `SELECT id, public_id, pool_id, draw_order, outcome_symbol, multiplier_bps, office_cells
         FROM cadi_kazan_office_tickets
        WHERE pool_id = $1
          AND claimed_round_id IS NULL
        ORDER BY draw_order
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      [active.id],
    )
  ).rows[0] ?? null;

  if (!ticket) {
    await client.query(
      "UPDATE cadi_kazan_office_pools SET status = 'EXHAUSTED', exhausted_at = COALESCE(exhausted_at, now()) WHERE id = $1",
      [active.id],
    );
    active = await ensureOfficePoolSupply(client);
    ticket = (
      await client.query<OfficeTicketRow>(
        `SELECT id, public_id, pool_id, draw_order, outcome_symbol, multiplier_bps, office_cells
           FROM cadi_kazan_office_tickets
          WHERE pool_id = $1
            AND claimed_round_id IS NULL
          ORDER BY draw_order
          LIMIT 1
          FOR UPDATE SKIP LOCKED`,
        [active.id],
      )
    ).rows[0] ?? null;
  }
  if (!ticket) throw new Error("OFFICE_POOL_EMPTY");

  await client.query(
    `UPDATE cadi_kazan_office_tickets
        SET claimed_round_id = $1,
            claimed_session_id = $2,
            claimed_at = now()
      WHERE id = $3`,
    [roundId, sessionId, ticket.id],
  );

  const remainingInClaimedPool = await getOfficePoolRemaining(client, active.id);
  if (remainingInClaimedPool === 0) {
    await client.query(
      "UPDATE cadi_kazan_office_pools SET status = 'EXHAUSTED', exhausted_at = COALESCE(exhausted_at, now()) WHERE id = $1",
      [active.id],
    );
    const nextActive = await ensureOfficePoolSupply(client);
    return { ticket, remaining: await getOfficePoolRemaining(client, nextActive.id) };
  }

  return { ticket, remaining: remainingInClaimedPool };
}

async function ensureWalletForUpdate(client: PoolClient, sessionId: string) {
  await client.query(
    "INSERT INTO shared_wallets (session_id, balance_cents) VALUES ($1, $2) ON CONFLICT (session_id) DO NOTHING",
    [sessionId, INITIAL_SHARED_BALANCE_CENTS],
  );
  const result = await client.query<WalletRow>(
    "SELECT balance_cents FROM shared_wallets WHERE session_id = $1 FOR UPDATE",
    [sessionId],
  );
  return Number(result.rows[0]?.balance_cents ?? 0);
}

async function walletBalance(sessionId: string) {
  const result = await pool.query<WalletRow>("SELECT balance_cents FROM shared_wallets WHERE session_id = $1", [sessionId]);
  if (!result.rows[0]) {
    await pool.query(
      "INSERT INTO shared_wallets (session_id, balance_cents) VALUES ($1, $2) ON CONFLICT (session_id) DO NOTHING",
      [sessionId, INITIAL_SHARED_BALANCE_CENTS],
    );
    return INITIAL_SHARED_BALANCE_CENTS;
  }
  return Number(result.rows[0].balance_cents);
}

async function latestRound(sessionId: string) {
  const result = await pool.query<CadiRoundRow>(
    "SELECT * FROM cadi_kazan_rounds WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1",
    [sessionId],
  );
  return result.rows[0] ?? null;
}

function stateFrom(sessionId: string, balanceCents: number, row: CadiRoundRow | null): CadiKazanState {
  return {
    wallet: { sessionId, balanceCents },
    round: row ? toSnapshot(row) : null,
  };
}

export class CadiKazanRepository {
  async getOfficePoolStatus(): Promise<CadiKazanOfficePoolStatus> {
    await ensureBigMoneyStorage();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const active = await ensureOfficePoolSupply(client);
      const remaining = await getOfficePoolRemaining(client, active.id);
      await client.query("COMMIT");
      return { remaining, total: OFFICE_POOL_SIZE };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getState(sessionId: string): Promise<CadiKazanState> {
    await ensureBigMoneyStorage();
    const [balanceCents, row] = await Promise.all([walletBalance(sessionId), latestRound(sessionId)]);
    return stateFrom(sessionId, balanceCents, row);
  }

  async createRound(
    sessionId: string,
    input: { mode: CadiKazanMode; alarmCount: number; stakeCents: number; idempotencyKey: string },
  ) {
    await ensureBigMoneyStorage();
    validateRoundInput(input);
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(input.idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
    const cellCount = getCellCount(input.mode);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const balanceCents = await ensureWalletForUpdate(client, sessionId);
      const duplicate = await client.query<CadiRoundRow>(
        "SELECT * FROM cadi_kazan_rounds WHERE start_idempotency_key = $1 FOR UPDATE",
        [input.idempotencyKey],
      );
      if (duplicate.rows[0]) {
        if (duplicate.rows[0].session_id !== sessionId) throw new Error("IDEMPOTENCY_KEY_REUSED");
        await client.query("COMMIT");
        return stateFrom(sessionId, balanceCents, duplicate.rows[0]);
      }
      const active = await client.query(
        "SELECT id FROM cadi_kazan_rounds WHERE session_id = $1 AND status = 'ACTIVE' LIMIT 1 FOR UPDATE",
        [sessionId],
      );
      if (active.rows[0]) throw new Error("ACTIVE_CADI_KAZAN_ROUND_EXISTS");
      if (balanceCents < input.stakeCents) throw new Error("INSUFFICIENT_CADI_KAZAN_CREDITS");

      const roundId = randomUUID();
      const officeClaim = input.mode === "OFFICE_MATCH_6"
        ? await claimOfficeTicket(client, roundId, sessionId)
        : null;
      const bombIndices = input.mode === "OFFICE_MATCH_6" ? [] : chooseBombIndices(cellCount, input.alarmCount);
      const officeCells = officeClaim ? safeOfficeSymbolArray(officeClaim.ticket.office_cells) : null;
      if (input.mode === "OFFICE_MATCH_6" && officeCells?.length !== cellCount) {
        throw new Error("INVALID_OFFICE_POOL_TICKET");
      }
      await client.query(
        "UPDATE shared_wallets SET balance_cents = balance_cents - $1, updated_at = now() WHERE session_id = $2",
        [input.stakeCents, sessionId],
      );
      const result = await client.query<CadiRoundRow>(
        `INSERT INTO cadi_kazan_rounds
          (
            id, session_id, mode, alarm_count, cell_count, stake_cents,
            bomb_indices, office_cells, office_pool_id, office_ticket_id,
            office_ticket_public_id, office_pool_remaining,
            revealed_cells, revealed_safe_count, current_multiplier_bps,
            status, payout_cents, start_idempotency_key
          )
         VALUES (
           $1, $2, $3, $4, $5, $6,
           $7::jsonb, $8::jsonb, $9, $10,
           $11, $12,
           '[]'::jsonb, 0, 0,
           'ACTIVE', 0, $13
         )
         RETURNING *`,
        [
          roundId,
          sessionId,
          input.mode,
          input.alarmCount,
          cellCount,
          input.stakeCents,
          JSON.stringify(bombIndices),
          officeCells ? JSON.stringify(officeCells) : null,
          officeClaim?.ticket.pool_id ?? null,
          officeClaim?.ticket.id ?? null,
          officeClaim?.ticket.public_id ?? null,
          officeClaim?.remaining ?? null,
          input.idempotencyKey,
        ],
      );
      await client.query(
        "INSERT INTO cadi_kazan_ledger (id, session_id, round_id, kind, amount_cents, idempotency_key) VALUES ($1, $2, $3, 'STAKE_DEBIT', $4, $5)",
        [randomUUID(), sessionId, roundId, -input.stakeCents, `stake:${input.idempotencyKey}`],
      );
      await client.query("COMMIT");
      return stateFrom(sessionId, balanceCents - input.stakeCents, result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async prepareReveal(sessionId: string, roundId: string, cellIndex: number) {
    await ensureBigMoneyStorage();
    if (!Number.isInteger(cellIndex)) throw new Error("INVALID_CADI_KAZAN_CELL");

    const result = await pool.query<CadiRoundRow>(
      "SELECT * FROM cadi_kazan_rounds WHERE id = $1 AND session_id = $2 LIMIT 1",
      [roundId, sessionId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("CADI_KAZAN_ROUND_NOT_FOUND");
    if (row.status !== "ACTIVE") throw new Error("CADI_KAZAN_ROUND_NOT_ACTIVE");
    if (cellIndex < 0 || cellIndex >= Number(row.cell_count)) throw new Error("INVALID_CADI_KAZAN_CELL");

    return getPreparedReveal(
      row.id,
      row.mode,
      cellIndex,
      safeNumberArray(row.bomb_indices),
      safeOfficeSymbolArray(row.office_cells),
    );
  }

  async revealCell(sessionId: string, roundId: string, cellIndex: number, idempotencyKey: string) {
    await ensureBigMoneyStorage();
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
    if (!Number.isInteger(cellIndex)) throw new Error("INVALID_CADI_KAZAN_CELL");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<RevealContextRow>(
        `SELECT r.*,
                a.session_id AS action_session_id,
                a.round_id AS action_round_id,
                a.kind AS action_kind,
                w.balance_cents AS wallet_balance_cents
           FROM cadi_kazan_rounds r
           LEFT JOIN cadi_kazan_ledger a
             ON a.idempotency_key = $3
           LEFT JOIN shared_wallets w
             ON w.session_id = r.session_id
          WHERE r.id = $1
            AND r.session_id = $2
          FOR UPDATE OF r`,
        [roundId, sessionId, idempotencyKey],
      );
      const row = result.rows[0];
      if (!row) throw new Error("CADI_KAZAN_ROUND_NOT_FOUND");

      const readRevealBalance = async () => (
        row.wallet_balance_cents === null
          ? ensureWalletForUpdate(client, sessionId)
          : Number(row.wallet_balance_cents)
      );

      if (row.action_kind) {
        if (
          row.action_session_id !== sessionId ||
          row.action_round_id !== roundId ||
          row.action_kind !== `REVEAL:${cellIndex}`
        ) {
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        }
        const balanceCents = await readRevealBalance();
        await client.query("COMMIT");
        return { outcome: "NOOP" as const, state: stateFrom(sessionId, balanceCents, row) };
      }
      const revealedCells = safeNumberArray(row.revealed_cells);
      if (row.status !== "ACTIVE" || revealedCells.includes(cellIndex)) {
        const balanceCents = await readRevealBalance();
        await client.query("COMMIT");
        return { outcome: "NOOP" as const, state: stateFrom(sessionId, balanceCents, row) };
      }
      if (cellIndex < 0 || cellIndex >= row.cell_count) throw new Error("INVALID_CADI_KAZAN_CELL");

      const bombIndices = safeNumberArray(row.bomb_indices);
      const nextRevealedCells = [...revealedCells, cellIndex].sort((a, b) => a - b);

      if (row.mode === "OFFICE_MATCH_6") {
        const officeCells = safeOfficeSymbolArray(row.office_cells);
        if (officeCells.length !== row.cell_count) throw new Error("INVALID_OFFICE_BOARD_STORAGE");

        const resolution = resolveOfficeMatchReveal(officeCells, nextRevealedCells);
        const revealedSafeCount = nextRevealedCells.length;
        const payoutCents = resolution.win
          ? getCashoutPayoutCents(Number(row.stake_cents), resolution.multiplierBps)
          : 0;
        const nextStatus: CadiKazanStatus = resolution.completed ? "COMPLETED" : "ACTIVE";
        const updated = await client.query<CadiRoundRow>(
          `UPDATE cadi_kazan_rounds
           SET revealed_cells = $1::jsonb,
               revealed_safe_count = $2,
               current_multiplier_bps = $3,
               status = $4,
               payout_cents = $5,
               updated_at = now(),
               completed_at = CASE WHEN $6 THEN now() ELSE completed_at END
           WHERE id = $7
           RETURNING *`,
          [
            JSON.stringify(nextRevealedCells),
            revealedSafeCount,
            resolution.multiplierBps,
            nextStatus,
            payoutCents,
            resolution.completed,
            roundId,
          ],
        );
        await client.query(
          "INSERT INTO cadi_kazan_ledger (id, session_id, round_id, kind, amount_cents, idempotency_key) VALUES ($1, $2, $3, $4, 0, $5)",
          [randomUUID(), sessionId, roundId, `REVEAL:${cellIndex}`, idempotencyKey],
        );

        let balanceCents = resolution.win && payoutCents > 0
          ? await ensureWalletForUpdate(client, sessionId)
          : await readRevealBalance();
        if (resolution.win && payoutCents > 0) {
          await client.query(
            "UPDATE shared_wallets SET balance_cents = balance_cents + $1, updated_at = now() WHERE session_id = $2",
            [payoutCents, sessionId],
          );
          await client.query(
            "INSERT INTO cadi_kazan_ledger (id, session_id, round_id, kind, amount_cents, idempotency_key) VALUES ($1, $2, $3, 'PAYOUT_CREDIT', $4, $5)",
            [randomUUID(), sessionId, roundId, payoutCents, `payout:${roundId}`],
          );
          balanceCents += payoutCents;
        }

        await client.query("COMMIT");
        return {
          outcome: resolution.completed ? "COMPLETED" as const : "SAFE" as const,
          state: stateFrom(sessionId, balanceCents, updated.rows[0]),
        };
      }

      if (bombIndices.includes(cellIndex)) {
        const busted = await client.query<CadiRoundRow>(
          "UPDATE cadi_kazan_rounds SET revealed_cells = $1::jsonb, current_multiplier_bps = 0, payout_cents = 0, status = 'BUST', updated_at = now(), completed_at = now() WHERE id = $2 RETURNING *",
          [JSON.stringify(nextRevealedCells), roundId],
        );
        await client.query(
          "INSERT INTO cadi_kazan_ledger (id, session_id, round_id, kind, amount_cents, idempotency_key) VALUES ($1, $2, $3, $4, 0, $5)",
          [randomUUID(), sessionId, roundId, `REVEAL:${cellIndex}`, idempotencyKey],
        );
        const balanceCents = await readRevealBalance();
        await client.query("COMMIT");
        return { outcome: "BUST" as const, state: stateFrom(sessionId, balanceCents, busted.rows[0]) };
      }

      const revealedSafeCount = Number(row.revealed_safe_count) + 1;
      const currentMultiplierBps = getCashoutMultiplierBps(row.mode, Number(row.alarm_count), revealedSafeCount);
      const safeCellCount = getSafeCellCount(row.mode, Number(row.alarm_count));
      const completed = revealedSafeCount >= safeCellCount;
      const payoutCents = completed ? getCashoutPayoutCents(Number(row.stake_cents), currentMultiplierBps) : 0;
      const nextStatus: CadiKazanStatus = completed ? "COMPLETED" : "ACTIVE";
      const updated = await client.query<CadiRoundRow>(
        `UPDATE cadi_kazan_rounds
         SET revealed_cells = $1::jsonb, revealed_safe_count = $2, current_multiplier_bps = $3, status = $4, payout_cents = $5, updated_at = now(), completed_at = CASE WHEN $6 THEN now() ELSE completed_at END
         WHERE id = $7
         RETURNING *`,
        [JSON.stringify(nextRevealedCells), revealedSafeCount, currentMultiplierBps, nextStatus, payoutCents, completed, roundId],
      );
      await client.query(
        "INSERT INTO cadi_kazan_ledger (id, session_id, round_id, kind, amount_cents, idempotency_key) VALUES ($1, $2, $3, $4, 0, $5)",
        [randomUUID(), sessionId, roundId, `REVEAL:${cellIndex}`, idempotencyKey],
      );
      let balanceCents = completed
        ? await ensureWalletForUpdate(client, sessionId)
        : await readRevealBalance();
      if (completed) {
        await client.query(
          "UPDATE shared_wallets SET balance_cents = balance_cents + $1, updated_at = now() WHERE session_id = $2",
          [payoutCents, sessionId],
        );
        await client.query(
          "INSERT INTO cadi_kazan_ledger (id, session_id, round_id, kind, amount_cents, idempotency_key) VALUES ($1, $2, $3, 'PAYOUT_CREDIT', $4, $5)",
          [randomUUID(), sessionId, roundId, payoutCents, `payout:${roundId}`],
        );
        balanceCents += payoutCents;
      }
      await client.query("COMMIT");
      return { outcome: completed ? "COMPLETED" as const : "SAFE" as const, state: stateFrom(sessionId, balanceCents, updated.rows[0]) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async cashOut(sessionId: string, roundId: string, idempotencyKey: string) {
    await ensureBigMoneyStorage();
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existingReveal = await client.query<CadiActionRow>(
        "SELECT session_id, round_id, kind FROM cadi_kazan_ledger WHERE idempotency_key = $1 FOR UPDATE",
        [idempotencyKey],
      );
      const existingCashout = await client.query<{ session_id: string; round_id: string }>(
        "SELECT session_id, id AS round_id FROM cadi_kazan_rounds WHERE cashout_idempotency_key = $1 FOR UPDATE",
        [idempotencyKey],
      );
      const result = await client.query<CadiRoundRow>(
        "SELECT * FROM cadi_kazan_rounds WHERE id = $1 AND session_id = $2 FOR UPDATE",
        [roundId, sessionId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("CADI_KAZAN_ROUND_NOT_FOUND");
      if (existingReveal.rows[0] && (
        existingReveal.rows[0].session_id !== sessionId
        || existingReveal.rows[0].round_id !== roundId
        || !existingReveal.rows[0].kind.startsWith("REVEAL:")
      )) {
        throw new Error("IDEMPOTENCY_KEY_REUSED");
      }
      if (existingCashout.rows[0] && (
        existingCashout.rows[0].session_id !== sessionId
        || existingCashout.rows[0].round_id !== roundId
      )) {
        throw new Error("IDEMPOTENCY_KEY_REUSED");
      }
      const balanceCents = await ensureWalletForUpdate(client, sessionId);
      if (row.status !== "ACTIVE") {
        await client.query("COMMIT");
        return { outcome: "NOOP" as const, state: stateFrom(sessionId, balanceCents, row) };
      }
      if (row.mode === "OFFICE_MATCH_6") throw new Error("OFFICE_MATCH_NO_CASH_OUT");
      if (Number(row.revealed_safe_count) < 1 || Number(row.current_multiplier_bps) <= 0) throw new Error("CASH_OUT_REQUIRES_SAFE_REVEAL");
       const payoutCents = getCashoutPayoutCents(Number(row.stake_cents), Number(row.current_multiplier_bps));
      const updated = await client.query<CadiRoundRow>(
        "UPDATE cadi_kazan_rounds SET status = 'CASHED_OUT', payout_cents = $1, cashout_idempotency_key = $2, updated_at = now(), completed_at = now() WHERE id = $3 RETURNING *",
        [payoutCents, idempotencyKey, roundId],
      );
      await client.query(
        "UPDATE shared_wallets SET balance_cents = balance_cents + $1, updated_at = now() WHERE session_id = $2",
        [payoutCents, sessionId],
      );
      await client.query(
        "INSERT INTO cadi_kazan_ledger (id, session_id, round_id, kind, amount_cents, idempotency_key) VALUES ($1, $2, $3, 'PAYOUT_CREDIT', $4, $5)",
        [randomUUID(), sessionId, roundId, payoutCents, `payout:${roundId}`],
      );
      await client.query("COMMIT");
      return { outcome: "CASHED_OUT" as const, state: stateFrom(sessionId, balanceCents + payoutCents, updated.rows[0]) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const cadiKazanRepository = new CadiKazanRepository();