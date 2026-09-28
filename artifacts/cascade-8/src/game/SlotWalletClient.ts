import type { SpinResult } from "../engine/types";

type Wallet = { sessionId: string; balanceCents: number };
type SpinResponse = { roundId: string; result: SpinResult; wallet: Wallet };

const API_BASE = "/api/slot";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "SLOT_CONNECTION_FAILED");
  return body as T;
}

export class SlotWalletClient {
  async bootstrap(): Promise<Wallet> {
    const legacyValue = localStorage.getItem("cascade8-balance");
    if (legacyValue !== null) {
      const legacyBalanceCents = Number(legacyValue);
      if (Number.isInteger(legacyBalanceCents) && legacyBalanceCents >= 0) {
        const response = await fetch(`${API_BASE}/migrate`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ legacyBalanceCents }),
        });
        const migrated = await readResponse<{ wallet: Wallet }>(response);
        localStorage.removeItem("cascade8-balance");
        return migrated.wallet;
      }
      localStorage.removeItem("cascade8-balance");
    }
    const response = await fetch(`${API_BASE}/state`, { credentials: "same-origin" });
    return (await readResponse<{ wallet: Wallet }>(response)).wallet;
  }

  async spin(stakeCents: number, idempotencyKey: string): Promise<SpinResponse> {
    const response = await fetch(`${API_BASE}/spins`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stakeCents, idempotencyKey }),
    });
    return readResponse<SpinResponse>(response);
  }
}