import type { RouletteRoundSettlement } from "./betRules";
import type { RouletteBetPlacement } from "./betState";
import type { RouletteWinningResult } from "./spinResult";

export type RouletteWallet = {
  sessionId: string;
  balanceCents: number;
};

export type RouletteServerSpinResponse = {
  roundId: string;
  seed: string;
  result: RouletteWinningResult;
  settlement: RouletteRoundSettlement;
  wallet: RouletteWallet;
};

const API_BASE = "/api/roulette";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "ROULETTE_CONNECTION_FAILED",
    );
  }

  return body as T;
}

export class RouletteWalletClient {
  async bootstrap() {
    const response = await fetch(`${API_BASE}/state`, {
      credentials: "same-origin",
    });

    return (
      await readResponse<{ wallet: RouletteWallet }>(response)
    ).wallet;
  }

  async spin(
    bets: readonly RouletteBetPlacement[],
    idempotencyKey: string,
  ) {
    const response = await fetch(`${API_BASE}/spins`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bets, idempotencyKey }),
    });

    return readResponse<RouletteServerSpinResponse>(response);
  }
}
