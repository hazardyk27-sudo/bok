import { createHash, randomBytes, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import {
  simulatePhysicsLabRound,
  type PhysicsLabEvent,
  type PhysicsLabRoundStatus,
  type PhysicsLabSimulationResult,
  type PhysicsLabStartConditions,
  type PhysicsLabTrajectorySample,
} from "./simulation";

const PHYSICS_LAB_LOCK_KEY = 834_119;

type PhysicsLabRoundRow = {
  id: string;
  sequence: number;
  status: PhysicsLabRoundStatus;
  seed: string;
  start_conditions: PhysicsLabStartConditions;
  final_pocket_index: number | null;
  final_pocket_number: number | null;
  stable_settle_step: number | null;
  simulation_duration_ms: number;
  trajectory: PhysicsLabTrajectorySample[];
  events: PhysicsLabEvent[];
  trajectory_hash: string;
  error_code: string | null;
  simulation_started_at: Date;
  settled_at: Date | null;
  created_at: Date;
};

export type PhysicsLabRound = {
  roundId: string;
  sequence: number;
  status: PhysicsLabRoundStatus;
  winningNumber: number | null;
  finalPocket: {
    index: number;
    number: number;
  } | null;
  startConditions: PhysicsLabStartConditions;
  timestamps: {
    createdAt: string;
    simulationStartedAt: string;
    settledAt: string | null;
  };
  stableSettleStep: number | null;
  simulationDurationMs: number;
  trajectory: PhysicsLabTrajectorySample[];
  events: PhysicsLabEvent[];
  trajectoryHash: string;
  errorCode: string | null;
};

function toRound(row: PhysicsLabRoundRow): PhysicsLabRound {
  return {
    roundId: row.id,
    sequence: Number(row.sequence),
    status: row.status,
    winningNumber: row.final_pocket_number,
    finalPocket:
      row.final_pocket_index === null || row.final_pocket_number === null
        ? null
        : {
            index: row.final_pocket_index,
            number: row.final_pocket_number,
          },
    startConditions: row.start_conditions,
    timestamps: {
      createdAt: new Date(row.created_at).toISOString(),
      simulationStartedAt: new Date(row.simulation_started_at).toISOString(),
      settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    },
    stableSettleStep: row.stable_settle_step,
    simulationDurationMs: row.simulation_duration_ms,
    trajectory: row.trajectory,
    events: row.events,
    trajectoryHash: row.trajectory_hash,
    errorCode: row.error_code,
  };
}

export class PhysicsLabRepository {
  async getCurrentRound() {
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1)", [PHYSICS_LAB_LOCK_KEY]);
      const latest = await client.query<PhysicsLabRoundRow>(
        "SELECT * FROM physics_lab_rounds ORDER BY sequence DESC LIMIT 1",
      );
      if (latest.rows[0]) return toRound(latest.rows[0]);
      return await this.createRoundWithLock(client, 1);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [
        PHYSICS_LAB_LOCK_KEY,
      ]);
      client.release();
    }
  }

  async createRound() {
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1)", [PHYSICS_LAB_LOCK_KEY]);
      const latest = await client.query<{ sequence: number; status: PhysicsLabRoundStatus }>(
        "SELECT sequence, status FROM physics_lab_rounds ORDER BY sequence DESC LIMIT 1",
      );
      const sequence = Number(latest.rows[0]?.sequence ?? 0) + 1;
      return await this.createRoundWithLock(client, sequence);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [
        PHYSICS_LAB_LOCK_KEY,
      ]);
      client.release();
    }
  }

  async getRound(roundId: string) {
    const result = await pool.query<PhysicsLabRoundRow>(
      "SELECT * FROM physics_lab_rounds WHERE id = $1",
      [roundId],
    );
    return result.rows[0] ? toRound(result.rows[0]) : null;
  }

  private async createRoundWithLock(
    client: { query: <T = unknown>(text: string, values?: unknown[]) => Promise<{ rows: T[] }> },
    sequence: number,
  ) {
    const roundId = randomUUID();
    const seed = randomBytes(32).toString("hex");
    const simulationStartedAt = new Date();
    const simulation = await simulatePhysicsLabRound(roundId, seed);
    const settledAt =
      simulation.status === "SETTLED" && simulation.stableSettleStep !== null
        ? new Date(
            simulationStartedAt.getTime() +
              simulation.stableSettleStep * (1000 / 120),
          )
        : null;

    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO physics_lab_rounds
          (id, sequence, status, seed, start_conditions, final_pocket_index,
           final_pocket_number, stable_settle_step, simulation_duration_ms,
           trajectory, events, trajectory_hash, error_code,
           simulation_started_at, settled_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb,
                 $11::jsonb, $12, $13, $14, $15)`,
        [
          roundId,
          sequence,
          simulation.status,
          seed,
          JSON.stringify(simulation.startConditions),
          simulation.finalPocketIndex,
          simulation.finalPocketNumber,
          simulation.stableSettleStep,
          simulation.simulationDurationMs,
          JSON.stringify(simulation.trajectory),
          JSON.stringify(simulation.events),
          simulation.trajectoryHash,
          simulation.errorCode,
          simulationStartedAt,
          settledAt,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const persisted = await client.query<PhysicsLabRoundRow>(
      "SELECT * FROM physics_lab_rounds WHERE id = $1",
      [roundId],
    );
    if (!persisted.rows[0]) {
      throw new Error("PHYSICS_LAB_PERSISTENCE_FAILED");
    }
    return toRound(persisted.rows[0]);
  }
}

export const physicsLabRepository = new PhysicsLabRepository();