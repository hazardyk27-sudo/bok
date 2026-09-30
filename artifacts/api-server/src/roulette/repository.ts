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
  upsertRouletteGlobalBet,
} from "./globalBetStore";
import {
  getCurrentRouletteGlobalTableSnapshot,
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
      Date.now();
    const [
      balanceCents,
      globalTable,
    ] =
      await Promise.all([
        walletBalance(
          sessionId,
        ),
        getCurrentRouletteGlobalTableSnapshot(
          serverTimeMs,
        ),
      ]);

    const globalBet =
      globalTable
        ? await getRouletteGlobalBetForRound(
            sessionId,
            globalTable.roundId,
          )
        : null;

    return {
      simulationVersion:
        ROULETTE_SIMULATION_VERSION,
      serverTimeMs,
      globalTable,
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
