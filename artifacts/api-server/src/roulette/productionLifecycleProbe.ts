import { writeFileSync } from "node:fs";
import { pool } from "@workspace/db";

const roundId = process.env.ROULETTE_E2E_ROUND_ID ?? "";
if (!roundId) throw new Error("ROULETTE_E2E_ROUND_ID_REQUIRED");

const result = await pool.query(
  `SELECT
     rr.id,
     rr.winning_number,
     rr.physics_round_id,
     pr.status AS physics_status,
     pr.final_pocket_index,
     pr.final_pocket_number,
     pr.trajectory_hash,
     jsonb_array_length(pr.trajectory) AS trajectory_samples
   FROM roulette_rounds rr
   LEFT JOIN physics_lab_rounds pr ON pr.id = rr.physics_round_id
   WHERE rr.id = $1
   LIMIT 1`,
  [roundId],
);

const row = result.rows[0];
if (!row) throw new Error("ROULETTE_E2E_ROUND_NOT_FOUND");
if (!row.physics_round_id) throw new Error("ROULETTE_E2E_PHYSICS_ROUND_MISSING");
if (row.physics_status !== "SETTLED") {
  throw new Error(`ROULETTE_E2E_PHYSICS_NOT_SETTLED:${row.physics_status}`);
}
if (
  row.winning_number === null ||
  row.final_pocket_number === null ||
  Number(row.winning_number) !== Number(row.final_pocket_number)
) {
  throw new Error("ROULETTE_E2E_RESULT_NOT_PHYSICS_AUTHORED");
}
if (Number(row.trajectory_samples) < 2 || !row.trajectory_hash) {
  throw new Error("ROULETTE_E2E_TRAJECTORY_INVALID");
}

writeFileSync(
  "/tmp/roulette-production-db.json",
  JSON.stringify(
    {
      rouletteRoundId: row.id,
      winningNumber: Number(row.winning_number),
      physicsRoundId: row.physics_round_id,
      finalPocketIndex: Number(row.final_pocket_index),
      finalPocketNumber: Number(row.final_pocket_number),
      trajectoryHash: row.trajectory_hash,
      trajectorySamples: Number(row.trajectory_samples),
    },
    null,
    2,
  ),
);

await pool.query(
  `UPDATE roulette_rounds
   SET
     open_until = NOW() - INTERVAL '50 seconds',
     last_call_until = NOW() - INTERVAL '40 seconds',
     locked_until = NOW() - INTERVAL '30 seconds',
     reveal_until = NOW() - INTERVAL '20 seconds',
     spinning_until = NOW() - INTERVAL '10 seconds',
     result_until = NOW() + INTERVAL '60 seconds',
     settling_until = NOW() + INTERVAL '70 seconds',
     intermission_until = NOW() + INTERVAL '80 seconds',
     updated_at = NOW()
   WHERE id = $1`,
  [roundId],
);

console.log(
  "ROULETTE_PRODUCTION_DB_AUTHORITY_PASS " +
    JSON.stringify({
      rouletteRoundId: row.id,
      winningNumber: Number(row.winning_number),
      physicsRoundId: row.physics_round_id,
      finalPocketIndex: Number(row.final_pocket_index),
      finalPocketNumber: Number(row.final_pocket_number),
      trajectoryHash: row.trajectory_hash,
      trajectorySamples: Number(row.trajectory_samples),
    }),
);

await pool.end();
