import { randomInt, randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { INITIAL_ROULETTE_BALANCE_CENTS } from "../roulette/types";
import {
  ADVANCED_ALARM_OPTIONS,
  CADI_KAZAN_ADVANCED_CELL_COUNT,
  CADI_KAZAN_MIN_STAKE_CENTS,
  CADI_KAZAN_MODES,
  CADI_KAZAN_STANDARD_CELL_COUNT,
  type CadiKazanMode,
  type CadiKazanRoundSnapshot,
  type CadiKazanState,
  type CadiKazanStatus,
  getCashoutMultiplierBps,
  getCashoutPayoutCents,
  getMaxSafeStakeCents,
  getSafeCellCount,
  getVisibleBombCells,
} from "./types";

type CadiRoundRow = {
  id: string;
  session_id: string;
  mode: CadiKazanMode;
  alarm_count: number;
  cell_count: number;
  stake_cents: number;
  bomb_indices: unknown;
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

const safeNumberArray = (value: unknown) => (Array.isArray(value) ? value.map(Number).filter(Number.isInteger) : []);
const asIso = (value: Date) => value.toISOString();

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
}

function chooseBombIndices(cellCount: number, alarmCount: number) {
  const selected = new Set<number>();
  while (selected.size < alarmCount) selected.add(randomInt(0, cellCount));
  return [...selected].sort((a, b) => a - b);
}

function toSnapshot(row: CadiRoundRow): CadiKazanRoundSnapshot {
  const bombIndices = safeNumberArray(row.bomb_indices);
  const revealedCells = safeNumberArray(row.revealed_cells);
  return {
    id: row.id,
    mode: row.mode,
    alarmCount: Number(row.alarm_count),
    cellCount: Number(row.cell_count),
    stakeCents: Number(row.stake_cents),
    revealedCells,
    revealedSafeCount: Number(row.revealed_safe_count),
    currentMultiplierBps: Number(row.current_multiplier_bps),
    currentCashoutCents: getCashoutPayoutCents(Number(row.stake_cents), Number(row.current_multiplier_bps)),
    status: row.status,
    payoutCents: Number(row.payout_cents),
    revealedBombCells: getVisibleBombCells(row.status, bombIndices),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

async function ensureWalletForUpdate(client: PoolClient, sessionId: string) {
  await client.query(
    "INSERT INTO roulette_wallets (session_id, balance_cents) VALUES ($1, $2) ON CONFLICT (session_id) DO NOTHING",
    [sessionId, INITIAL_ROULETTE_BALANCE_CENTS],
  );
  const result = await client.query<WalletRow>(
    "SELECT balance_cents FROM roulette_wallets WHERE session_id = $1 FOR UPDATE",
    [sessionId],
  );
  return Number(result.rows[0]?.balance_cents ?? 0);
}

async function walletBalance(sessionId: string) {
  const result = await pool.query<WalletRow>("SELECT balance_cents FROM roulette_wallets WHERE session_id = $1", [sessionId]);
  if (!result.rows[0]) {
    await pool.query(
      "INSERT INTO roulette_wallets (session_id, balance_cents) VALUES ($1, $2) ON CONFLICT (session_id) DO NOTHING",
      [sessionId, INITIAL_ROULETTE_BALANCE_CENTS],
    );
    return INITIAL_ROULETTE_BALANCE_CENTS;
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
  async getState(sessionId: string): Promise<CadiKazanState> {
    const [balanceCents, row] = await Promise.all([walletBalance(sessionId), latestRound(sessionId)]);
    return stateFrom(sessionId, balanceCents, row);
  }

  async createRound(
    sessionId: string,
    input: { mode: CadiKazanMode; alarmCount: number; stakeCents: number; idempotencyKey: string },
  ) {
    validateRoundInput(input);
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(input.idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
    const cellCount = input.mode === "STANDARD" ? CADI_KAZAN_STANDARD_CELL_COUNT : CADI_KAZAN_ADVANCED_CELL_COUNT;
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
      const bombIndices = chooseBombIndices(cellCount, input.alarmCount);
      await client.query(
        "UPDATE roulette_wallets SET balance_cents = balance_cents - $1, updated_at = now() WHERE session_id = $2",
        [input.stakeCents, sessionId],
      );
      const result = await client.query<CadiRoundRow>(
        `INSERT INTO cadi_kazan_rounds
          (id, session_id, mode, alarm_count, cell_count, stake_cents, bomb_indices, revealed_cells, revealed_safe_count, current_multiplier_bps, status, payout_cents, start_idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, '[]'::jsonb, 0, 0, 'ACTIVE', 0, $8)
         RETURNING *`,
        [roundId, sessionId, input.mode, input.alarmCount, cellCount, input.stakeCents, JSON.stringify(bombIndices), input.idempotencyKey],
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

  async revealCell(sessionId: string, roundId: string, cellIndex: number, idempotencyKey: string) {
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
    if (!Number.isInteger(cellIndex)) throw new Error("INVALID_CADI_KAZAN_CELL");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existingAction = await client.query<CadiActionRow>(
        "SELECT session_id, round_id, kind FROM cadi_kazan_ledger WHERE idempotency_key = $1 FOR UPDATE",
        [idempotencyKey],
      );
      const result = await client.query<CadiRoundRow>(
        "SELECT * FROM cadi_kazan_rounds WHERE id = $1 AND session_id = $2 FOR UPDATE",
        [roundId, sessionId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("CADI_KAZAN_ROUND_NOT_FOUND");
      if (existingAction.rows[0]) {
        const action = existingAction.rows[0];
        if (action.session_id !== sessionId || action.round_id !== roundId || action.kind !== `REVEAL:${cellIndex}`) {
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        }
        const balanceCents = await ensureWalletForUpdate(client, sessionId);
        await client.query("COMMIT");
        return { outcome: "NOOP" as const, state: stateFrom(sessionId, balanceCents, row) };
      }
      const revealedCells = safeNumberArray(row.revealed_cells);
      if (row.status !== "ACTIVE" || revealedCells.includes(cellIndex)) {
        const balanceCents = await ensureWalletForUpdate(client, sessionId);
        await client.query("COMMIT");
        return { outcome: "NOOP" as const, state: stateFrom(sessionId, balanceCents, row) };
      }
      if (cellIndex < 0 || cellIndex >= row.cell_count) throw new Error("INVALID_CADI_KAZAN_CELL");

      const bombIndices = safeNumberArray(row.bomb_indices);
      const nextRevealedCells = [...revealedCells, cellIndex].sort((a, b) => a - b);
      if (bombIndices.includes(cellIndex)) {
        const busted = await client.query<CadiRoundRow>(
          "UPDATE cadi_kazan_rounds SET revealed_cells = $1::jsonb, current_multiplier_bps = 0, payout_cents = 0, status = 'BUST', updated_at = now(), completed_at = now() WHERE id = $2 RETURNING *",
          [JSON.stringify(nextRevealedCells), roundId],
        );
        await client.query(
          "INSERT INTO cadi_kazan_ledger (id, session_id, round_id, kind, amount_cents, idempotency_key) VALUES ($1, $2, $3, $4, 0, $5)",
          [randomUUID(), sessionId, roundId, `REVEAL:${cellIndex}`, idempotencyKey],
        );
        const balanceCents = await ensureWalletForUpdate(client, sessionId);
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
      let balanceCents = await ensureWalletForUpdate(client, sessionId);
      if (completed) {
        await client.query(
          "UPDATE roulette_wallets SET balance_cents = balance_cents + $1, updated_at = now() WHERE session_id = $2",
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
      if (Number(row.revealed_safe_count) < 1 || Number(row.current_multiplier_bps) <= 0) throw new Error("CASH_OUT_REQUIRES_SAFE_REVEAL");
       const payoutCents = getCashoutPayoutCents(Number(row.stake_cents), Number(row.current_multiplier_bps));
      const updated = await client.query<CadiRoundRow>(
        "UPDATE cadi_kazan_rounds SET status = 'CASHED_OUT', payout_cents = $1, cashout_idempotency_key = $2, updated_at = now(), completed_at = now() WHERE id = $3 RETURNING *",
        [payoutCents, idempotencyKey, roundId],
      );
      await client.query(
        "UPDATE roulette_wallets SET balance_cents = balance_cents + $1, updated_at = now() WHERE session_id = $2",
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