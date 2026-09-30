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
    },
  ) {
    return upsertRouletteGlobalBet({
      sessionId,
      ...input,
    });
  }
}

export const rouletteRepository =
  new RouletteRepository();
