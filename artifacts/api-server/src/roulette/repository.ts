import {
  pool,
} from "@workspace/db";
import {
  INITIAL_SHARED_BALANCE_CENTS,
} from "../platform/wallet";
import {
  ROULETTE_SIMULATION_VERSION,
} from "../../../cascade-8/src/roulette/spinResult";
import {
  getRouletteGlobalStakeCents,
} from "./globalBet";
import {
  getRouletteGlobalBetForRound,
  settleRouletteGlobalBetForRoundSession,
  upsertRouletteGlobalBet,
} from "./globalBetStore";
import {
  getCurrentRouletteGlobalTableSnapshot,
  getRouletteDatabaseNowMs,
  getRouletteGlobalRecentResults,
} from "./globalTableStore";
import type {
  RouletteServerBet,
} from "./round";

type WalletRow = {
  balance_cents: number;
};

const ROULETTE_LATEST_WRITE_MAX_ATTEMPTS = 4;

async function walletBalance(
  sessionId: string,
) {
  const result =
    await pool.query<WalletRow>(
      "SELECT balance_cents FROM shared_wallets WHERE session_id = $1",
      [sessionId],
    );

  if (result.rows[0]) {
    return Number(
      result.rows[0]
        .balance_cents,
    );
  }

  await pool.query(
    `INSERT INTO shared_wallets
      (session_id, balance_cents)
     VALUES ($1, $2)
     ON CONFLICT (session_id)
     DO NOTHING`,
    [
      sessionId,
      INITIAL_SHARED_BALANCE_CENTS,
    ],
  );

  return INITIAL_SHARED_BALANCE_CENTS;
}

function isRouletteStaleWrite(error: unknown) {
  return (
    error instanceof Error &&
    error.message === "ROULETTE_GLOBAL_BET_STALE"
  );
}

export class RouletteRepository {
  async getState(
    sessionId: string,
  ) {
    const serverTimeMs =
      await getRouletteDatabaseNowMs();
    const [
      globalTable,
      recentResults,
    ] =
      await Promise.all([
        getCurrentRouletteGlobalTableSnapshot(
          serverTimeMs,
        ),
        getRouletteGlobalRecentResults(
          serverTimeMs,
          11,
        ),
      ]);

    if (
      globalTable?.result
    ) {
      await settleRouletteGlobalBetForRoundSession(
        sessionId,
        globalTable.roundId,
        serverTimeMs,
      );
    }

    const [
      balanceCents,
      globalBet,
    ] =
      await Promise.all([
        walletBalance(
          sessionId,
        ),
        globalTable
          ? getRouletteGlobalBetForRound(
              sessionId,
              globalTable.roundId,
            )
          : Promise.resolve(
              null,
            ),
      ]);

    return {
      simulationVersion:
        ROULETTE_SIMULATION_VERSION,
      serverTimeMs,
      globalTable,
      recentResults,
      globalBet:
        globalBet?.globalBet ??
        null,
      wallet: {
        sessionId,
        balanceCents:
          globalBet
            ?.balanceCents ??
          balanceCents,
      },
    };
  }

  async updateGlobalBet(
    sessionId: string,
    input: {
      roundId: string;
      bets:
        RouletteServerBet[];
      idempotencyKey:
        string;
      expectedRevision:
        number;
      requestReceivedAtMs:
        number;
    },
  ) {
    return upsertRouletteGlobalBet({
      sessionId,
      ...input,
    });
  }

  async updateGlobalBetLatest(
    sessionId: string,
    input: {
      roundId: string;
      bets:
        RouletteServerBet[];
      idempotencyKey:
        string;
      requestReceivedAtMs:
        number;
    },
  ) {
    let lastError: unknown = null;
    const desiredStakeCents =
      getRouletteGlobalStakeCents(
        input.bets,
      );

    // This path is used only by monotonic x2. The route stamps
    // requestReceivedAtMs before any database wait. If an older wager write is
    // already holding the per-slip lock, retry against the newly committed
    // revision while preserving that original server arrival time. A delayed
    // older x2 request is also prevented from lowering a newer doubled stake.
    for (
      let attempt = 0;
      attempt < ROULETTE_LATEST_WRITE_MAX_ATTEMPTS;
      attempt += 1
    ) {
      const current =
        await getRouletteGlobalBetForRound(
          sessionId,
          input.roundId,
        );
      const currentStakeCents =
        current.globalBet?.stakeCents ?? 0;

      if (
        current.globalBet &&
        currentStakeCents >= desiredStakeCents
      ) {
        return current;
      }

      const expectedRevision =
        current.globalBet?.revision ?? 0;

      try {
        return await upsertRouletteGlobalBet({
          sessionId,
          ...input,
          expectedRevision,
        });
      } catch (error) {
        lastError = error;
        if (!isRouletteStaleWrite(error)) {
          throw error;
        }
      }
    }

    throw (
      lastError instanceof Error
        ? lastError
        : new Error("ROULETTE_GLOBAL_BET_STALE")
    );
  }
}

export const rouletteRepository =
  new RouletteRepository();
