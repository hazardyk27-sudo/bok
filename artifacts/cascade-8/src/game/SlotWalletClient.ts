import type { Board, FreeSpinResult, SpinResult, TumbleResult } from "../engine/types";

type Wallet = { sessionId: string; balanceCents: number };
type WireTumbleResult = Omit<TumbleResult, "boardBefore" | "boardAfterGravity" | "newSymbols" | "multiplierCoreCells">;
type WireFreeSpinResult = Omit<FreeSpinResult, "tumbles"> & { tumbles: WireTumbleResult[] };
type WireSpinResult = Omit<SpinResult, "tumbles" | "freeSpins"> & {
  tumbles: WireTumbleResult[];
  freeSpins: WireFreeSpinResult[];
};
type WireSpinResponse = { roundId: string; result: WireSpinResult; wallet: Wallet };
type WireSpinStart = { roundId: string; result: WireSpinResult };
type WireSpinSettled = { roundId: string; wallet: Wallet; result?: WireSpinResult };
type SpinSettlement = { roundId: string; wallet: Wallet; result?: SpinResult };
type StreamingSpinResponse = {
  roundId: string;
  result: SpinResult;
  settlement: Promise<SpinSettlement>;
};

const API_BASE = "/api/slot";

function hydrateTumbles(initialBoard: Board, tumbles: readonly WireTumbleResult[]): TumbleResult[] {
  let boardBefore = initialBoard;
  return tumbles.map((tumble) => {
    const hydrated: TumbleResult = {
      ...tumble,
      boardBefore,
      // These engine-only transport fields are not used by the live renderer.
      // Keep structurally valid values after reconstructing the compact wire payload.
      boardAfterGravity: tumble.boardAfterRefill,
      newSymbols: [],
      multiplierCoreCells: [],
    };
    boardBefore = tumble.boardAfterRefill;
    return hydrated;
  });
}

function hydrateSpinResult(result: WireSpinResult): SpinResult {
  return {
    ...result,
    tumbles: hydrateTumbles(result.initialBoard, result.tumbles),
    freeSpins: result.freeSpins.map((freeSpin) => ({
      ...freeSpin,
      tumbles: hydrateTumbles(freeSpin.initialBoard, freeSpin.tumbles),
    })),
  };
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "SLOT_CONNECTION_FAILED");
  return body as T;
}

type SpinStreamEvent =
  | { event: "result"; data: WireSpinStart }
  | { event: "settled"; data: WireSpinSettled }
  | { event: "error"; data: { error?: string } };

function createSpinEventReader(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("SLOT_STREAM_UNAVAILABLE");
  const decoder = new TextDecoder();
  let buffer = "";

  return async function nextEvent(): Promise<SpinStreamEvent> {
    while (true) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = block.split("\n");
        const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
        const dataText = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!eventName || !dataText) continue;
        const data = JSON.parse(dataText) as unknown;
        if (eventName === "result") return { event: "result", data: data as WireSpinStart };
        if (eventName === "settled") return { event: "settled", data: data as WireSpinSettled };
        if (eventName === "error") return { event: "error", data: data as { error?: string } };
        continue;
      }

      const chunk = await reader.read();
      if (chunk.done) throw new Error("SLOT_STREAM_CLOSED");
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
    }
  };
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

  async spin(stakeCents: number, idempotencyKey: string): Promise<StreamingSpinResponse> {
    const response = await fetch(`${API_BASE}/spins`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify({ stakeCents, idempotencyKey }),
    });

    if (!response.ok) {
      await readResponse<never>(response);
      throw new Error("SLOT_CONNECTION_FAILED");
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      const wire = await readResponse<WireSpinResponse>(response);
      return {
        roundId: wire.roundId,
        result: hydrateSpinResult(wire.result),
        settlement: Promise.resolve({
          roundId: wire.roundId,
          wallet: wire.wallet,
          result: hydrateSpinResult(wire.result),
        }),
      };
    }

    const nextEvent = createSpinEventReader(response);
    const first = await nextEvent();
    if (first.event === "error") {
      throw new Error(first.data.error ?? "SLOT_REQUEST_FAILED");
    }
    if (first.event !== "result") {
      throw new Error("SLOT_STREAM_PROTOCOL_ERROR");
    }

    const settlement = (async (): Promise<SpinSettlement> => {
      while (true) {
        const event = await nextEvent();
        if (event.event === "error") {
          throw new Error(event.data.error ?? "SLOT_REQUEST_FAILED");
        }
        if (event.event === "settled") {
          return {
            roundId: event.data.roundId,
            wallet: event.data.wallet,
            ...(event.data.result ? { result: hydrateSpinResult(event.data.result) } : {}),
          };
        }
      }
    })();

    return {
      roundId: first.data.roundId,
      result: hydrateSpinResult(first.data.result),
      settlement,
    };
  }
}