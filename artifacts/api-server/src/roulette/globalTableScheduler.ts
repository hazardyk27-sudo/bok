import {
  randomUUID,
} from "node:crypto";
import { logger } from "../lib/logger";
import {
  createRouletteGlobalRoundPlan,
  type RouletteGlobalRoundPlan,
} from "./globalTable";
import {
  ensureRouletteGlobalTableStorage,
  insertRouletteGlobalRound,
  readLatestRouletteGlobalRound,
  withRouletteGlobalSchedulerLock,
} from "./globalTableStore";

import {
  ROULETTE_GLOBAL_TABLE_RETRY_MS,
  ROULETTE_GLOBAL_TABLE_TICK_MS,
  buildRouletteGlobalRoundChain,
} from "./globalTableSchedule";

function createScheduledRound(
  bettingOpenAtMs: number,
) {
  return createRouletteGlobalRoundPlan({
    roundId:
      randomUUID(),
    seed:
      randomUUID(),
    bettingOpenAtMs,
  });
}

export async function runRouletteGlobalTableSchedulerTick(
  nowMs: number = Date.now(),
) {
  await ensureRouletteGlobalTableStorage();

  return withRouletteGlobalSchedulerLock(
    async (client) => {
      const latestRound =
        await readLatestRouletteGlobalRound(
          client,
        );
      const materialization =
        buildRouletteGlobalRoundChain({
          latestRound,
          nowMs,
          createRound:
            createScheduledRound,
        });

      let insertedRounds = 0;

      for (
        const round of
        materialization.rounds
      ) {
        if (
          await insertRouletteGlobalRound(
            client,
            round,
          )
        ) {
          insertedRounds += 1;
        }
      }

      return {
        ...materialization,
        insertedRounds,
      };
    },
  );
}

let schedulerStarted =
  false;
let schedulerTimer:
  ReturnType<typeof setTimeout> |
  null = null;

function scheduleNextTick(
  delayMs: number,
) {
  schedulerTimer =
    setTimeout(() => {
      void schedulerLoop();
    }, delayMs);

  schedulerTimer.unref?.();
}

async function schedulerLoop() {
  try {
    const result =
      await runRouletteGlobalTableSchedulerTick();

    if (
      result.insertedRounds >
      0
    ) {
      logger.info(
        {
          insertedRounds:
            result.insertedRounds,
          coveredThroughMs:
            result.coveredThroughMs,
        },
        "Roulette global table materialized",
      );
    }

    scheduleNextTick(
      result.reachedHorizon
        ? ROULETTE_GLOBAL_TABLE_TICK_MS
        : 0,
    );
  } catch (error) {
    logger.error(
      {
        err: error,
      },
      "Roulette global table scheduler tick failed",
    );

    scheduleNextTick(
      ROULETTE_GLOBAL_TABLE_RETRY_MS,
    );
  }
}

export function startRouletteGlobalTableScheduler() {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;
  void schedulerLoop();
}

export function stopRouletteGlobalTableScheduler() {
  schedulerStarted = false;

  if (schedulerTimer) {
    clearTimeout(
      schedulerTimer,
    );
    schedulerTimer = null;
  }
}
