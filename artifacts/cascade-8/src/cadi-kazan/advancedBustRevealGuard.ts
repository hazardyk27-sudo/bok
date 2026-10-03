type AdvancedPreparedReveal = {
  roundId: string;
  cellIndex: number;
  mode: "ADVANCED";
  kind: "BOMB";
};

type AdvancedBustRound = {
  id: string;
  mode: "ADVANCED";
  status: "BUST";
  cellCount: number;
  revealedBombCells: number[];
};

type CadiMutationResponse = {
  state?: { round?: AdvancedBustRound | null; [key: string]: unknown };
};

type GuardWindow = Window & {
  __cadiAdvancedBustRevealGuardInstalled?: boolean;
};

type AdvancedBustStateConsumer = (state: unknown) => void;

const API_PREFIX = "/api/cadi-kazan/rounds/";
const settlingBombs = new Set<string>();
let consumeAdvancedBustState: AdvancedBustStateConsumer | null = null;

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function forceAdvancedBustReveal(round: AdvancedBustRound) {
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

function applyBustAcrossRenderFrames(round: AdvancedBustRound) {
  const apply = () => forceAdvancedBustReveal(round);
  queueMicrotask(apply);
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
  window.setTimeout(apply, 80);
}

async function settlePreparedAdvancedBomb(nativeFetch: typeof window.fetch, prepared: AdvancedPreparedReveal) {
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
        idempotencyKey: `advanced-bust-${crypto.randomUUID()}-${Date.now()}`,
      }),
    });
    if (!response.ok) return;
    const data = await response.json() as CadiMutationResponse;
    const round = data.state?.round;
    if (round?.mode === "ADVANCED" && round.status === "BUST") {
      consumeAdvancedBustState?.(data.state);
      applyBustAcrossRenderFrames(round);
    }
  } finally {
    settlingBombs.delete(key);
  }
}

export function installAdvancedBustRevealGuard(consumeState?: AdvancedBustStateConsumer) {
  if (consumeState) consumeAdvancedBustState = consumeState;
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
        void response.clone().json().then((prepared: Partial<AdvancedPreparedReveal>) => {
          if (prepared.mode === "ADVANCED" && prepared.kind === "BOMB" && typeof prepared.roundId === "string" && Number.isInteger(prepared.cellIndex)) {
            void settlePreparedAdvancedBomb(nativeFetch, prepared as AdvancedPreparedReveal);
          }
        }).catch(() => undefined);
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
