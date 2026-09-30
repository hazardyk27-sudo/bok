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

export const ROULETTE_GLOBAL_TABLE_LOOKAHEAD_MS =
  60_000;
export const ROULETTE_GLOBAL_TABLE_TICK_MS =
  1_000;
export const ROULETTE_GLOBAL_TABLE_RETRY_MS =
  2_000;
export const ROULETTE_GLOBAL_TABLE_MAX_ROUNDS_PER_TICK =
  256;

export type RouletteGlobalMaterialization = {
  rounds: RouletteGlobalRoundPlan[];
  coveredThroughMs: number;
  reachedHorizon: boolean;
};

export function buildRouletteGlobalRoundChain(input: {
  latestRound: RouletteGlobalRoundPlan | null;
  nowMs: number;
  lookaheadMs?: number;
  maxRounds?: number;
  createRound: (
    bettingOpenAtMs: number,
  ) => RouletteGlobalRoundPlan;
}): RouletteGlobalMaterialization {
  const lookaheadMs =
    input.lookaheadMs ??
    ROULETTE_GLOBAL_TABLE_LOOKAHEAD_MS;
  const maxRounds =
    input.maxRounds ??
    ROULETTE_GLOBAL_TABLE_MAX_ROUNDS_PER_TICK;
  const horizonMs =
    input.nowMs +
    lookaheadMs;

  if (
    !Number.isFinite(
      input.nowMs,
    ) ||
    !Number.isFinite(
      lookaheadMs,
    ) ||
    lookaheadMs < 0 ||
    !Number.isSafeInteger(
      maxRounds,
    ) ||
    maxRounds <= 0
  ) {
    throw new Error(
      "INVALID_ROULETTE_GLOBAL_SCHEDULER_INPUT",
    );
  }

  const rounds:
    RouletteGlobalRoundPlan[] =
      [];
  let cursor =
    input.latestRound;

  if (!cursor) {
    cursor =
      input.createRound(
        input.nowMs,
      );
    rounds.push(cursor);
  }

  while (
    cursor.nextRoundAtMs <=
      horizonMs &&
    rounds.length <
      maxRounds
  ) {
    const next =
      input.createRound(
        cursor.nextRoundAtMs,
      );

    if (
      next.bettingOpenAtMs !==
      cursor.nextRoundAtMs
    ) {
      throw new Error(
        "ROULETTE_GLOBAL_ROUND_GAP",
      );
    }

    rounds.push(next);
    cursor = next;
  }

  return {
    rounds,
    coveredThroughMs:
      cursor.nextRoundAtMs,
    reachedHorizon:
      cursor.nextRoundAtMs >
      horizonMs,
  };
}

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
