import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import {
  INITIAL_ROULETTE_BALANCE_CENTS,
  MAX_STAKE_CENTS,
  MIN_STAKE_CENTS,
  MULTIPLIER_VALUES,
  PHASE_DURATIONS_MS,
  ROULETTE_PHASES,
  type RouletteEvent,
  type RouletteBetInput,
  type RouletteBetType,
  ROULETTE_BET_TYPES,
  ROULETTE_PAYOUT_UNITS,
  type RouletteMultiplier,
  type RoulettePhase,
  type RouletteRoundRecord,
  type RouletteSnapshot,
} from "./types";
import { chooseLuckyNumbers, chooseMultipliers, createCommitment, newId, uniformWinningNumber } from "./rng";

const LEADER_LOCK_KEY = 834_118;
const REVEAL_STEP_MS = 1_250;

type Subscriber = (event: RouletteEvent) => void;

type RoundRow = {
  id: string;
  sequence: number;
  phase: RoulettePhase;
  starts_at: Date;
  open_until: Date;
  last_call_until: Date;
  locked_until: Date;
  spinning_until: Date;
  result_until: Date;
  reveal_until: Date;
  settling_until: Date;
  intermission_until: Date;
  winning_number: number | null;
  lucky_numbers: number[];
  multipliers: RouletteMultiplier[];
  commitment_hash: string;
  version: number;
  created_at: Date;
  updated_at: Date;
};
type LeaderClient = { query: (...args: any[]) => Promise<any>; release: () => void };

const iso = (value: Date) => value.toISOString();
const safeJson = <T>(value: unknown, fallback: T): T => (Array.isArray(value) ? value as T : fallback);

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const normalizeNumbers = (numbers: number[]) => [...new Set(numbers)].sort((a, b) => a - b);
const validSplit = (numbers: number[]) => {
  const [a, b] = numbers;
  if (a === 0 || b === 0) return [a, b].includes(0) && [a, b].some((value) => value >= 1 && value <= 3);
  const verticalNeighbor = Math.abs(a - b) === 1 && Math.min(a, b) % 3 !== 0;
  const horizontalNeighbor = Math.abs(a - b) === 3;
  return verticalNeighbor || horizontalNeighbor;
};
const validBetNumbers = (type: RouletteBetType, numbers: number[]) => {
  const expected = {
    STRAIGHT: 1, SPLIT: 2, STREET: 3, CORNER: 4, SIX_LINE: 6,
    DOZEN: 12, COLUMN: 12, RED: 18, BLACK: 18, ODD: 18, EVEN: 18, LOW: 18, HIGH: 18,
  }[type];
  if (numbers.length !== expected || numbers.some((number) => !Number.isInteger(number) || number < 0 || number > 36)) return false;
  if (type === "SPLIT") return validSplit(numbers);
  if (type === "STRAIGHT") return true;
  if (type === "STREET") return numbers.every((number) => number > 0) && numbers.every((number) => Math.floor((number - 1) / 3) === Math.floor((numbers[0] - 1) / 3));
  if (type === "CORNER") {
    const positive = numbers.filter((number) => number > 0);
    const rows = [...new Set(positive.map((number) => (number - 1) % 3))].sort();
    const columns = [...new Set(positive.map((number) => Math.floor((number - 1) / 3)))].sort((a, b) => a - b);
    return positive.length === 4 && rows.length === 2 && columns.length === 2 && columns[1] === columns[0] + 1;
  }
  if (type === "SIX_LINE") {
    const start = numbers[0];
    return start > 0 && start <= 31 && start % 3 === 1
      && numbers.every((number, index) => number === start + index);
  }
  if (type === "DOZEN") {
    const start = numbers[0];
    return [1, 13, 25].includes(start) && numbers.every((number) => number >= start && number <= start + 11);
  }
  if (type === "COLUMN") return new Set(numbers.filter(Boolean).map((number) => (number - 1) % 3)).size === 1;
  const expectedSet = {
    RED: RED_NUMBERS,
    BLACK: new Set([...Array.from({ length: 36 }, (_, index) => index + 1)].filter((number) => !RED_NUMBERS.has(number))),
    ODD: new Set([...Array.from({ length: 18 }, (_, index) => index * 2 + 1)]),
    EVEN: new Set([...Array.from({ length: 18 }, (_, index) => (index + 1) * 2)]),
    LOW: new Set([...Array.from({ length: 18 }, (_, index) => index + 1)]),
    HIGH: new Set([...Array.from({ length: 18 }, (_, index) => index + 19)]),
  }[type as "RED" | "BLACK" | "ODD" | "EVEN" | "LOW" | "HIGH"];
  return Boolean(expectedSet && numbers.every((number) => expectedSet.has(number)) && expectedSet.size === numbers.length);
};

export class RouletteRepository {
  private currentRound: RouletteRoundRecord | null = null;
  private subscribers = new Set<Subscriber>();
  private scheduler?: NodeJS.Timeout;
  private leaseTimer?: NodeJS.Timeout;
  private leaseClient?: LeaderClient;
  private isLeader = false;
  private started = false;

  async start() {
    if (this.started) return;
    this.started = true;
    await this.tryAcquireLeadership();
    await this.loadOrCreateRound();
    this.scheduler = setInterval(() => void this.tick(), 250);
    this.leaseTimer = setInterval(() => void this.tryAcquireLeadership(), 5_000);
  }

  async stop() {
    if (this.scheduler) clearInterval(this.scheduler);
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    this.scheduler = undefined;
    this.leaseTimer = undefined;
    if (this.leaseClient) {
      try {
        await this.leaseClient.query("SELECT pg_advisory_unlock($1)", [LEADER_LOCK_KEY]);
      } finally {
        this.leaseClient.release();
        this.leaseClient = undefined;
      }
    }
    this.isLeader = false;
    this.started = false;
  }

  subscribe(subscriber: Subscriber) {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  get leadership(): "leader" | "standby" {
    return this.isLeader ? "leader" : "standby";
  }

  async getSnapshot(sessionId: string): Promise<RouletteSnapshot> {
    await this.start();
    const round = this.currentRound ?? await this.loadOrCreateRound();
    const wallet = await this.getWallet(sessionId);
    return this.toSnapshot(round, wallet.balanceCents, new Date(), sessionId);
  }

  async placeBets(sessionId: string, input: { bets: RouletteBetInput[]; idempotencyKey: string }) {
    await this.start();
    if (!Array.isArray(input.bets) || input.bets.length < 1 || input.bets.length > 60) throw new Error("BETS_MUST_BE_1_TO_60");
    if (!/^[a-zA-Z0-9_-]{12,80}$/.test(input.idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
    const bets = input.bets.map((bet) => {
      const type = String(bet.type).toUpperCase() as RouletteBetType;
      const numbers = normalizeNumbers((Array.isArray(bet.numbers) ? bet.numbers : []).map(Number));
      const stakeCents = Number(bet.stakeCents);
      if (!ROULETTE_BET_TYPES.includes(type) || !validBetNumbers(type, numbers)) throw new Error("INVALID_BET_SELECTION");
      if (!Number.isInteger(stakeCents) || stakeCents < MIN_STAKE_CENTS || stakeCents > MAX_STAKE_CENTS) throw new Error("STAKE_OUT_OF_RANGE");
      return { type, numbers, stakeCents, label: typeof bet.label === "string" ? bet.label.slice(0, 40) : undefined };
    });
    const totalStakeCents = bets.reduce((sum, bet) => sum + bet.stakeCents, 0);
    const round = this.currentRound ?? await this.loadOrCreateRound();
    if (round.phase !== "OPEN" && round.phase !== "LAST_CALL") throw new Error("BETTING_CLOSED");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query("SELECT id, session_id, round_id, number, bet_type, numbers, stake_cents, status, payout_cents FROM roulette_bets WHERE batch_id = $1 ORDER BY created_at", [input.idempotencyKey]);
      if (existing.rows[0]) {
        if (existing.rows[0].session_id !== sessionId) throw new Error("IDEMPOTENCY_KEY_REUSED");
        await client.query("COMMIT");
        const wallet = await this.getWallet(sessionId);
        return { duplicate: true, bets: existing.rows, totalStakeCents: existing.rows.reduce((sum: number, bet: { stake_cents: number }) => sum + Number(bet.stake_cents), 0), wallet };
      }

      const roundLock = await client.query("SELECT phase FROM roulette_rounds WHERE id = $1 FOR UPDATE", [round.id]);
      if (!["OPEN", "LAST_CALL"].includes(roundLock.rows[0]?.phase)) throw new Error("BETTING_CLOSED");
      const wallet = await client.query("SELECT balance_cents FROM roulette_wallets WHERE session_id = $1 FOR UPDATE", [sessionId]);
      const balanceCents = wallet.rows[0]?.balance_cents ?? INITIAL_ROULETTE_BALANCE_CENTS;
      if (!wallet.rows[0]) {
        await client.query("INSERT INTO roulette_wallets (session_id, balance_cents) VALUES ($1, $2)", [sessionId, balanceCents]);
      }
      if (balanceCents < totalStakeCents) throw new Error("INSUFFICIENT_ROULETTE_CREDITS");

      await client.query("UPDATE roulette_wallets SET balance_cents = balance_cents - $1, updated_at = now() WHERE session_id = $2", [totalStakeCents, sessionId]);
      const acceptedBets = [];
      for (const [index, bet] of bets.entries()) {
        const betId = newId();
        const rowKey = `${input.idempotencyKey}-${index}`;
        await client.query(
          "INSERT INTO roulette_bets (id, round_id, session_id, number, bet_type, numbers, batch_id, stake_cents, idempotency_key) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)",
          [betId, round.id, sessionId, bet.numbers[0] ?? 0, bet.type, JSON.stringify(bet.numbers), input.idempotencyKey, bet.stakeCents, rowKey],
        );
        await client.query(
          "INSERT INTO roulette_ledger (id, session_id, round_id, bet_id, kind, amount_cents, idempotency_key) VALUES ($1, $2, $3, $4, 'BET_DEBIT', $5, $6)",
          [newId(), sessionId, round.id, betId, -bet.stakeCents, `debit:${rowKey}`],
        );
        acceptedBets.push({ id: betId, roundId: round.id, type: bet.type, numbers: bet.numbers, stakeCents: bet.stakeCents, status: "ACCEPTED", payoutCents: 0 });
      }
      await client.query("COMMIT");
      return {
        duplicate: false,
        bets: acceptedBets,
        totalStakeCents,
        wallet: { sessionId, balanceCents: balanceCents - totalStakeCents },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async placeBet(sessionId: string, input: { number: number; stakeCents: number; idempotencyKey: string }) {
    return this.placeBets(sessionId, {
      idempotencyKey: input.idempotencyKey,
      bets: [{ type: "STRAIGHT", numbers: [Number(input.number)], stakeCents: Number(input.stakeCents) }],
    });
  }

  async getWallet(sessionId: string) {
    const result = await pool.query("SELECT session_id, balance_cents FROM roulette_wallets WHERE session_id = $1", [sessionId]);
    if (!result.rows[0]) {
      await pool.query("INSERT INTO roulette_wallets (session_id, balance_cents) VALUES ($1, $2) ON CONFLICT (session_id) DO NOTHING", [sessionId, INITIAL_ROULETTE_BALANCE_CENTS]);
      return { sessionId, balanceCents: INITIAL_ROULETTE_BALANCE_CENTS };
    }
    return { sessionId: result.rows[0].session_id as string, balanceCents: result.rows[0].balance_cents as number };
  }

  async getRecentResults(limit = 12) {
    const bounded = Math.min(30, Math.max(1, Math.floor(limit)));
    const result = await pool.query(
      "SELECT id, sequence, winning_number, lucky_numbers, multipliers, updated_at FROM roulette_rounds WHERE winning_number IS NOT NULL ORDER BY sequence DESC LIMIT $1",
      [bounded],
    );
    return result.rows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      winningNumber: row.winning_number,
      luckyNumbers: safeJson<number[]>(row.lucky_numbers, []),
      multipliers: safeJson<RouletteMultiplier[]>(row.multipliers, []),
      settledAt: row.updated_at ?? null,
    }));
  }

  private async tryAcquireLeadership() {
    if (this.leaseClient) return;
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [LEADER_LOCK_KEY]);
      if (!result.rows[0]?.locked) {
        client.release();
        this.isLeader = false;
        return;
      }
      this.leaseClient = client;
      this.isLeader = true;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  private async loadOrCreateRound(): Promise<RouletteRoundRecord> {
    if (this.currentRound && this.currentRound.intermissionUntil.getTime() > Date.now() - 1000) return this.currentRound;
    const result = await pool.query("SELECT * FROM roulette_rounds ORDER BY sequence DESC LIMIT 1");
    if (result.rows[0]) {
      const loaded = this.mapRound(result.rows[0] as RoundRow);
      if (loaded.intermissionUntil.getTime() > Date.now()) {
        this.currentRound = loaded;
        return loaded;
      }
      if (!this.isLeader) {
        this.currentRound = loaded;
        return loaded;
      }
    }
    if (!this.isLeader) {
      const fallback = result.rows[0] ? this.mapRound(result.rows[0] as RoundRow) : null;
      if (fallback) return (this.currentRound = fallback);
      throw new Error("ROULETTE_COORDINATOR_UNAVAILABLE");
    }
    return this.createRound(result.rows[0] ? Number(result.rows[0].sequence) + 1 : 1);
  }

  private async createRound(sequence: number): Promise<RouletteRoundRecord> {
    const startsAt = new Date();
    const boundaries: Date[] = [];
    let cursor = startsAt.getTime();
    for (const phase of ROULETTE_PHASES) {
      cursor += PHASE_DURATIONS_MS[phase];
      boundaries.push(new Date(cursor));
    }
    const [openUntil, lastCallUntil, lockedUntil, spinningUntil, resultUntil, revealUntil, settlingUntil, intermissionUntil] = boundaries;
    const id = newId();
    const winningNumber = uniformWinningNumber();
    const luckyNumbers = chooseLuckyNumbers();
    const multipliers = chooseMultipliers(luckyNumbers.length);
    const commitmentHash = createCommitment(id, winningNumber, luckyNumbers, multipliers);
    const result = await pool.query(
      `INSERT INTO roulette_rounds
       (id, sequence, phase, starts_at, open_until, last_call_until, locked_until, spinning_until, result_until, reveal_until, settling_until, intermission_until, winning_number, lucky_numbers, multipliers, commitment_hash, version)
       VALUES ($1, $2, 'OPEN', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, 1)
       RETURNING *`,
      [id, sequence, startsAt, openUntil, lastCallUntil, lockedUntil, spinningUntil, resultUntil, revealUntil, settlingUntil, intermissionUntil, winningNumber, JSON.stringify(luckyNumbers), JSON.stringify(multipliers), commitmentHash],
    );
    const round = this.mapRound(result.rows[0] as RoundRow);
    this.currentRound = round;
    await this.recordEvent(round, "ROUND_OPEN", { phase: round.phase });
    this.publish("phase", round);
    return round;
  }

  private async tick() {
    if (!this.isLeader) return;
    const round = this.currentRound ?? await this.loadOrCreateRound();
    const now = new Date();
    if (now.getTime() >= round.intermissionUntil.getTime()) {
      await this.createRound(round.sequence + 1);
      return;
    }
    const nextPhase = this.phaseAt(round, now);
    if (nextPhase !== round.phase) {
      const previous = round.phase;
      round.phase = nextPhase;
      round.version += 1;
      round.updatedAt = now;
      await pool.query("UPDATE roulette_rounds SET phase = $1, version = $2, updated_at = $3 WHERE id = $4 AND version = $5", [nextPhase, round.version, now, round.id, round.version - 1]);
      await this.recordEvent(round, "PHASE_CHANGED", { from: previous, to: nextPhase });
      if (nextPhase === "SETTLING") await this.settleRound(round);
      this.publish(nextPhase === "SETTLING" ? "settled" : "phase", round);
      return;
    }
    const previousRevealCount = this.revealedCount(round, new Date(now.getTime() - 260));
    const currentRevealCount = this.revealedCount(round, now);
    if (currentRevealCount > previousRevealCount && round.phase === "MULTIPLIER_REVEAL") {
      round.version += 1;
      round.updatedAt = now;
      await pool.query("UPDATE roulette_rounds SET version = $1, updated_at = $2 WHERE id = $3", [round.version, now, round.id]);
      await this.recordEvent(round, "MULTIPLIER_REVEALED", { revealIndex: currentRevealCount - 1 });
      this.publish("reveal", round);
    }
  }

  private phaseAt(round: RouletteRoundRecord, now: Date): RoulettePhase {
    const time = now.getTime();
    if (time < round.openUntil.getTime()) return "OPEN";
    if (time < round.lastCallUntil.getTime()) return "LAST_CALL";
    if (time < round.lockedUntil.getTime()) return "LOCKED";
    if (time < round.spinningUntil.getTime()) return "SPINNING";
    if (time < round.resultUntil.getTime()) return "RESULT";
    if (time < round.revealUntil.getTime()) return "MULTIPLIER_REVEAL";
    if (time < round.settlingUntil.getTime()) return "SETTLING";
    return "INTERMISSION";
  }

  private revealedCount(round: RouletteRoundRecord, now: Date) {
    if (round.phase === "SETTLING" || round.phase === "INTERMISSION") return round.multipliers.length;
    if (round.phase !== "MULTIPLIER_REVEAL") return 0;
    return Math.min(round.multipliers.length, Math.max(0, Math.floor((now.getTime() - round.resultUntil.getTime()) / REVEAL_STEP_MS)));
  }

  private async settleRound(round: RouletteRoundRecord) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const bets = await client.query("SELECT id, session_id, number, bet_type, numbers, stake_cents FROM roulette_bets WHERE round_id = $1 AND status = 'ACCEPTED' FOR UPDATE", [round.id]);
      const luckyIndex = round.luckyNumbers.indexOf(round.winningNumber ?? -1);
      const multiplier = luckyIndex >= 0 ? round.multipliers[luckyIndex] : 0;
      for (const bet of bets.rows) {
        const betType = (bet.bet_type || "STRAIGHT") as RouletteBetType;
        const storedNumbers = safeJson<number[]>(bet.numbers, []);
        const numbers = storedNumbers.length ? storedNumbers : [Number(bet.number)];
        const coversWinningNumber = numbers.includes(round.winningNumber ?? -1);
        const payoutUnits = betType === "STRAIGHT" && luckyIndex >= 0 && coversWinningNumber
          ? multiplier
          : ROULETTE_PAYOUT_UNITS[betType] ?? 0;
        const payoutCents = coversWinningNumber ? bet.stake_cents * payoutUnits : 0;
        const status = payoutCents > 0 ? "WON" : "LOST";
        await client.query("UPDATE roulette_bets SET status = $1, payout_cents = $2, settled_at = now() WHERE id = $3 AND status = 'ACCEPTED'", [status, payoutCents, bet.id]);
        if (payoutCents > 0) {
          const idempotencyKey = `payout:${bet.id}`;
          const inserted = await client.query(
            "INSERT INTO roulette_ledger (id, session_id, round_id, bet_id, kind, amount_cents, idempotency_key) VALUES ($1, $2, $3, $4, 'PAYOUT', $5, $6) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id",
            [newId(), bet.session_id, round.id, bet.id, payoutCents, idempotencyKey],
          );
          if (inserted.rowCount) {
            await client.query("UPDATE roulette_wallets SET balance_cents = balance_cents + $1, updated_at = now() WHERE session_id = $2", [payoutCents, bet.session_id]);
          }
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordEvent(round: RouletteRoundRecord, eventType: string, payload: Record<string, unknown>) {
    await pool.query(
      "INSERT INTO roulette_events (id, round_id, event_type, version, payload, scheduled_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT (round_id, version) DO NOTHING",
      [newId(), round.id, eventType, round.version, JSON.stringify(payload), new Date()],
    );
  }

  private publish(type: RouletteEvent["type"], round: RouletteRoundRecord) {
    const eventId = createHash("sha1").update(`${round.id}:${round.version}:${type}`).digest("hex");
    for (const subscriber of this.subscribers) {
      void this.getSnapshotForRound(round).then((snapshot) => subscriber({ type, snapshot, eventId } as RouletteEvent));
    }
  }

  private async getSnapshotForRound(round: RouletteRoundRecord): Promise<RouletteSnapshot> {
    return this.toSnapshot(round, 0, new Date());
  }

  private toSnapshot(round: RouletteRoundRecord, balanceCents: number, now: Date, sessionId = ""): RouletteSnapshot {
    const phaseStartedAt = this.phaseStart(round);
    const nextTransitionAt = this.phaseEnd(round);
    const revealedCount = this.revealedCount(round, now);
    const isResultVisible = ["RESULT", "MULTIPLIER_REVEAL", "SETTLING", "INTERMISSION"].includes(round.phase);
    return {
      serverTime: iso(now),
      coordinator: this.leadership,
      wallet: { sessionId, balanceCents },
      round: {
        id: round.id,
        sequence: round.sequence,
        phase: round.phase,
        phaseStartedAt: iso(phaseStartedAt),
        nextTransitionAt: iso(nextTransitionAt),
        countdownMs: Math.max(0, nextTransitionAt.getTime() - now.getTime()),
        commitmentHash: round.commitmentHash,
        winningNumber: isResultVisible ? round.winningNumber : null,
        luckyNumbers: isResultVisible ? round.luckyNumbers : [],
        revealedMultipliers: round.multipliers.slice(0, revealedCount),
        multipliersTotal: round.multipliers.length,
        version: round.version,
      },
    };
  }

  private phaseStart(round: RouletteRoundRecord) {
    const ends = [round.openUntil, round.lastCallUntil, round.lockedUntil, round.spinningUntil, round.resultUntil, round.revealUntil, round.settlingUntil, round.intermissionUntil];
    const index = ROULETTE_PHASES.indexOf(round.phase);
    return index === 0 ? round.startsAt : ends[index - 1];
  }

  private phaseEnd(round: RouletteRoundRecord) {
    const ends = [round.openUntil, round.lastCallUntil, round.lockedUntil, round.spinningUntil, round.resultUntil, round.revealUntil, round.settlingUntil, round.intermissionUntil];
    return ends[ROULETTE_PHASES.indexOf(round.phase)] ?? round.intermissionUntil;
  }

  private mapRound(row: RoundRow): RouletteRoundRecord {
    return {
      id: row.id,
      sequence: row.sequence,
      phase: row.phase,
      startsAt: new Date(row.starts_at),
      openUntil: new Date(row.open_until),
      lastCallUntil: new Date(row.last_call_until),
      lockedUntil: new Date(row.locked_until),
      spinningUntil: new Date(row.spinning_until),
      resultUntil: new Date(row.result_until),
      revealUntil: new Date(row.reveal_until),
      settlingUntil: new Date(row.settling_until),
      intermissionUntil: new Date(row.intermission_until),
      winningNumber: row.winning_number,
      luckyNumbers: safeJson<number[]>(row.lucky_numbers, []),
      multipliers: safeJson<RouletteMultiplier[]>(row.multipliers, []),
      commitmentHash: row.commitment_hash,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const rouletteRepository = new RouletteRepository();