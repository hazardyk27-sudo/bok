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
const BOOTSTRAP_TIMEOUT_MS = 4_000;
const SPIN_RESPONSE_TIMEOUT_MS = 6_000;
const SPIN_RESULT_EVENT_TIMEOUT_MS = 6_000;
const SETTLEMENT_EVENT_TIMEOUT_MS = 8_000;
const RENDERER_MOUNT_TIMEOUT_MS = 2_500;
const RENDER_RECOVERY_RELOAD_GUARD_MS = 8_000;
const RENDER_RECOVERY_KEY = "cascade8-render-recovery-at";
let boardVisibilityEpoch = 0;
let renderRecoveryInstalled = false;
let renderRecoveryObserver: MutationObserver | null = null;
let recoveryReloadTimer: number | null = null;

function getBoardCanvas() {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLCanvasElement>("#phaser-board canvas");
}

function setBoardCanvasVisible(visible: boolean) {
  const canvas = getBoardCanvas();
  if (!canvas) return;
  canvas.style.visibility = visible ? "" : "hidden";
}

function markBoardRecovering(reason: string) {
  if (typeof document === "undefined") return;
  const board = document.getElementById("phaser-board");
  if (board) {
    board.dataset.slotRenderRecovering = "true";
    board.dataset.slotRenderReason = reason;
  }
  const status = document.getElementById("status");
  if (status) status.textContent = "GAME BOARD RECOVERING";
}

function cancelRecoveryReload() {
  if (typeof window === "undefined" || recoveryReloadTimer === null) return;
  window.clearTimeout(recoveryReloadTimer);
  recoveryReloadTimer = null;
}

function clearBoardRecovering() {
  cancelRecoveryReload();
  if (typeof document === "undefined") return;
  const board = document.getElementById("phaser-board");
  if (!board) return;
  delete board.dataset.slotRenderRecovering;
  delete board.dataset.slotRenderReason;
}

function isBoardRecovering() {
  if (typeof document === "undefined") return false;
  return document.getElementById("phaser-board")?.dataset.slotRenderRecovering === "true";
}

function requestRecoveryReload(reason: string) {
  if (typeof window === "undefined") return;
  markBoardRecovering(reason);
  if (recoveryReloadTimer !== null) return;

  let lastReloadAt = 0;
  try {
    lastReloadAt = Number(window.sessionStorage.getItem(RENDER_RECOVERY_KEY) ?? 0);
  } catch {
    lastReloadAt = 0;
  }

  const now = Date.now();
  const elapsed = Number.isFinite(lastReloadAt) ? now - lastReloadAt : RENDER_RECOVERY_RELOAD_GUARD_MS;
  const delay = elapsed < RENDER_RECOVERY_RELOAD_GUARD_MS
    ? RENDER_RECOVERY_RELOAD_GUARD_MS - Math.max(0, elapsed) + 50
    : 120;

  recoveryReloadTimer = window.setTimeout(() => {
    recoveryReloadTimer = null;
    try {
      window.sessionStorage.setItem(RENDER_RECOVERY_KEY, String(Date.now()));
    } catch {
      // Storage can be unavailable in hardened/private WebViews. Recovery still works.
    }
    window.location.reload();
  }, delay);
}

function invalidateProvisionalBoard() {
  boardVisibilityEpoch += 1;
  setBoardCanvasVisible(false);
  markBoardRecovering("settlement-sync");
}

function revealBoardOnNextFrame() {
  const expectedEpoch = boardVisibilityEpoch;
  if (typeof window === "undefined") {
    if (boardVisibilityEpoch === expectedEpoch) setBoardCanvasVisible(true);
    return;
  }
  window.requestAnimationFrame(() => {
    if (boardVisibilityEpoch === expectedEpoch && !isBoardRecovering()) {
      setBoardCanvasVisible(true);
    }
  });
}

function recoverBoardAfterAuthoritativeSync() {
  if (isBoardRecovering()) {
    requestRecoveryReload("authoritative-resync");
    return;
  }
  revealBoardOnNextFrame();
}

function attachCanvasRecoveryListeners(canvas: HTMLCanvasElement) {
  if (canvas.dataset.slotRenderRecoveryInstalled === "true") return;
  canvas.dataset.slotRenderRecoveryInstalled = "true";

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    boardVisibilityEpoch += 1;
    setBoardCanvasVisible(false);
    markBoardRecovering("webgl-context-lost");

    const recoveryTimer = window.setTimeout(() => {
      requestRecoveryReload("webgl-context-timeout");
    }, 2_000);

    canvas.addEventListener("webglcontextrestored", () => {
      window.clearTimeout(recoveryTimer);
      clearBoardRecovering();
      revealBoardOnNextFrame();
    }, { once: true });
  });
}

function installSlotRenderRecovery() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const attach = () => {
    const canvas = getBoardCanvas();
    if (canvas) attachCanvasRecoveryListeners(canvas);
  };

  attach();
  if (renderRecoveryInstalled) return;
  renderRecoveryInstalled = true;

  const board = document.getElementById("phaser-board");
  if (board && typeof MutationObserver !== "undefined") {
    renderRecoveryObserver = new MutationObserver(attach);
    renderRecoveryObserver.observe(board, { childList: true });
  }

  window.addEventListener("error", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    const source = target.currentSrc || target.src;
    if (!source.includes("/team-logos/") && !source.includes("/special-symbols/")) return;
    setBoardCanvasVisible(false);
    requestRecoveryReload("slot-asset-load-error");
  }, true);
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function ensureSlotRendererMounted() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const deadline = performance.now() + RENDERER_MOUNT_TIMEOUT_MS;

  while (performance.now() < deadline) {
    const canvas = getBoardCanvas();
    if (canvas && canvas.isConnected && canvas.width > 0 && canvas.height > 0) {
      attachCanvasRecoveryListeners(canvas);
      await nextAnimationFrame();
      await nextAnimationFrame();
      return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }

  setBoardCanvasVisible(false);
  requestRecoveryReload("renderer-mount-timeout");
  throw new Error("SLOT_RENDERER_NOT_READY");
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutCode: string,
) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timeoutCode);
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

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

  const readChunk = async (timeoutMs: number) => {
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = globalThis.setTimeout(() => {
            void reader.cancel().catch(() => undefined);
            reject(new Error("SLOT_STREAM_TIMEOUT"));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== null) globalThis.clearTimeout(timer);
    }
  };

  return async function nextEvent(timeoutMs: number): Promise<SpinStreamEvent> {
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

      const chunk = await readChunk(timeoutMs);
      if (chunk.done) throw new Error("SLOT_STREAM_CLOSED");
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
    }
  };
}

export class SlotWalletClient {
  constructor() {
    installSlotRenderRecovery();
  }

  async bootstrap(): Promise<Wallet> {
    await ensureSlotRendererMounted();

    const legacyValue = localStorage.getItem("cascade8-balance");
    if (legacyValue !== null) {
      const legacyBalanceCents = Number(legacyValue);
      if (Number.isInteger(legacyBalanceCents) && legacyBalanceCents >= 0) {
        const response = await fetchWithTimeout(`${API_BASE}/migrate`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ legacyBalanceCents }),
        }, BOOTSTRAP_TIMEOUT_MS, "SLOT_STATE_TIMEOUT");
        const migrated = await readResponse<{ wallet: Wallet }>(response);
        localStorage.removeItem("cascade8-balance");
        recoverBoardAfterAuthoritativeSync();
        return migrated.wallet;
      }
      localStorage.removeItem("cascade8-balance");
    }

    const response = await fetchWithTimeout(
      `${API_BASE}/state`,
      { credentials: "same-origin" },
      BOOTSTRAP_TIMEOUT_MS,
      "SLOT_STATE_TIMEOUT",
    );
    const wallet = (await readResponse<{ wallet: Wallet }>(response)).wallet;
    recoverBoardAfterAuthoritativeSync();
    return wallet;
  }

  async spin(stakeCents: number, idempotencyKey: string): Promise<StreamingSpinResponse> {
    installSlotRenderRecovery();
    const response = await fetchWithTimeout(`${API_BASE}/spins`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify({ stakeCents, idempotencyKey }),
    }, SPIN_RESPONSE_TIMEOUT_MS, "SLOT_SPIN_TIMEOUT");

    if (!response.ok) {
      await readResponse<never>(response);
      throw new Error("SLOT_CONNECTION_FAILED");
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      const wire = await readResponse<WireSpinResponse>(response);
      clearBoardRecovering();
      revealBoardOnNextFrame();
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
    const first = await nextEvent(SPIN_RESULT_EVENT_TIMEOUT_MS);
    if (first.event === "error") {
      throw new Error(first.data.error ?? "SLOT_REQUEST_FAILED");
    }
    if (first.event !== "result") {
      throw new Error("SLOT_STREAM_PROTOCOL_ERROR");
    }

    const settlement = (async (): Promise<SpinSettlement> => {
      try {
        while (true) {
          const event = await nextEvent(SETTLEMENT_EVENT_TIMEOUT_MS);
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
      } catch (error) {
        // Result is streamed before DB settlement so reel motion can start early.
        // If settlement then fails or stalls, hide that provisional board and mark
        // the renderer for an authoritative state recovery. GameController already
        // bootstraps the wallet in its error path; successful bootstrap reloads the
        // Slot route once so stale provisional graphics can never remain onscreen.
        invalidateProvisionalBoard();
        throw error;
      }
    })();

    clearBoardRecovering();
    revealBoardOnNextFrame();
    return {
      roundId: first.data.roundId,
      result: hydrateSpinResult(first.data.result),
      settlement,
    };
  }
}
