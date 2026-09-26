import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const physicsLabRounds = pgTable(
  "physics_lab_rounds",
  {
    id: text("id").primaryKey(),
    sequence: integer("sequence").notNull(),
    status: text("status").notNull(),
    seed: text("seed").notNull(),
    startConditions: jsonb("start_conditions").notNull(),
    finalPocketIndex: integer("final_pocket_index"),
    finalPocketNumber: integer("final_pocket_number"),
    stableSettleStep: integer("stable_settle_step"),
    simulationDurationMs: integer("simulation_duration_ms").notNull(),
    trajectory: jsonb("trajectory").notNull(),
    events: jsonb("events").notNull(),
    trajectoryHash: text("trajectory_hash").notNull(),
    errorCode: text("error_code"),
    simulationStartedAt: timestamp("simulation_started_at", { withTimezone: true }).notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("physics_lab_rounds_sequence_unique").on(table.sequence),
    index("physics_lab_rounds_status_idx").on(table.status),
  ],
);
