type BombCardMode = "STANDARD" | "ADVANCED";

type BombPreparedReveal = {
  roundId: string;
  cellIndex: number;
  mode: BombCardMode;
  kind: "BOMB";
  settlement?: CadiMutationResponse;
};

type BombTerminalRound = {
  id: string;
  mode: BombCardMode;
  status: "BUST" | "CASHED_OUT" | "COMPLETED";
  cellCount: number;
  revealedBombCells: number[];
};

type CadiMutationResponse = {
  outcome?: string;
  state?: { round?: BombTerminalRound | null; [key: string]: unknown };
};

type GuardWindow = Window & {
  __cadiAdvancedBustRevealGuardInstalled?: boolean;
};

type BombTerminalStateConsumer = (state: unknown) => void;

const API_PREFIX = "/api/cadi-kazan/rounds/";
const settlingBombs = new Set<string>();
let consumeBombTerminalState: BombTerminalStateConsumer | null = null;

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isBombCardMode(mode: unknown): mode is BombCardMode {
  return mode === "STANDARD" || mode === "ADVANCED";
}

export function forceAdvancedBustReveal(round: BombTerminalRound) {
  if (round.mode !== "ADVANCED" || round.status !== "BUST" || round.cellCount !== 25) return false;

  const bombIndices = new Set(round.revealedBombCells);
  const cells = Array.from(document.querySelectorAll<HTMLButtonElement>(".witch-page.is-advanced-theme [data-witch-cell]"));
  if (cells.length !== 25) return false;

  for (const cell of cells) {
    const index = Number(cell.dataset.witchCell);
    if (!Number.isInteger(index) || index < 0 || index >= 25) continue;
    const kind = bombIndices.has(index) ? "BOMB" : "SAFE";

    cell.disabled = true;
    cell.classList.add("is-revealed");
    cell.classList.toggle("is-bomb", kind === "BOMB");
    cell.classList.toggle("is-safe", kind === "SAFE");
    cell.dataset.cellState = kind === "BOMB" ? "bomb" : "safe";
    cell.dataset.authoritativeResult = kind;
    cell.dataset.preparedResult = kind;

    cell.querySelectorAll<HTMLElement>("[data-witch-result-candidate]").forEach((candidate) => {
      candidate.dataset.witchResultActive = candidate.dataset.witchResultCandidate === kind ? "true" : "false";
    });
    cell.querySelectorAll<HTMLElement>(".witch-scratch-layer, .witch-debris-canvas").forEach((layer) => {
      layer.hidden = true;
    });
  }

  return true;
}

function applyBustAcrossRenderFrames(round: BombTerminalRound) {
  if (round.mode !== "ADVANCED" || round.status !== "BUST") return;
  const apply = () => forceAdvancedBustReveal(round);
  queueMicrotask(apply);
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
  window.setTimeout(apply, 80);
}

function applyPreparedSettlement(settlement: CadiMutationResponse | undefined) {
  const state = settlement?.state;
  const round = state?.round;
  if (!round || !isBombCardMode(round.mode) || round.status === undefined) return false;

  consumeBombTerminalState?.(state);
  if (round.mode === "ADVANCED" && round.status === "BUST") applyBustAcrossRenderFrames(round);
  return true;
}

async function settlePreparedBomb(nativeFetch: typeof window.fetch, prepared: BombPreparedReveal) {
  const key = `${prepared.roundId}:${prepared.cellIndex}`;
  if (settlingBombs.has(key)) return;
  settlingBombs.add(key);

  try {
    const response = await nativeFetch(`${API_PREFIX}${encodeURIComponent(prepared.roundId)}/reveal`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cellIndex: prepared.cellIndex,
        idempotencyKey: `prepared-bust-${crypto.randomUUID()}-${Date.now()}`,
      }),
    });
    if (!response.ok) return;
    const data = await response.json() as CadiMutationResponse;
    applyPreparedSettlement(data);
  } finally {
    settlingBombs.delete(key);
  }
}

export function installAdvancedBustRevealGuard(consumeState?: BombTerminalStateConsumer) {
  if (consumeState) consumeBombTerminalState = consumeState;
  if (typeof window === "undefined") return;
  const guardedWindow = window as GuardWindow;
  if (guardedWindow.__cadiAdvancedBustRevealGuardInstalled) return;
  guardedWindow.__cadiAdvancedBustRevealGuardInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await nativeFetch(input, init);
    const url = requestUrl(input);

    if (response.ok && url.includes(API_PREFIX)) {
      if (url.endsWith("/prepare-reveal")) {
        // Wait for the cloned prepare payload before resolving the original fetch.
        // The API settles a bomb before returning it, so this applies terminal
        // state and disables Cash Out before the scratch surface can continue.
        const prepared = await response.clone().json().catch(() => null) as Partial<BombPreparedReveal> | null;
        if (
          prepared &&
          isBombCardMode(prepared.mode) &&
          prepared.kind === "BOMB" &&
          typeof prepared.roundId === "string" &&
          Number.isInteger(prepared.cellIndex)
        ) {
          const bombPrepared = prepared as BombPreparedReveal;
          if (!applyPreparedSettlement(bombPrepared.settlement)) {
            // Compatibility fallback for an older API runtime. It still settles
            // before the original prepare response is released to WitchClient.
            await settlePreparedBomb(nativeFetch, bombPrepared);
          }
        }
      } else if (url.endsWith("/reveal")) {
        void response.clone().json().then((data: CadiMutationResponse) => {
          const round = data.state?.round;
          if (round?.mode === "ADVANCED" && round.status === "BUST") applyBustAcrossRenderFrames(round);
        }).catch(() => undefined);
      }
    }

    return response;
  }) as typeof window.fetch;
}
