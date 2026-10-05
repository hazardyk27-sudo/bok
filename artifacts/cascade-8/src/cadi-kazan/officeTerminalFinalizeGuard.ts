type OfficeRound = {
  id: string;
  mode: "STANDARD" | "ADVANCED" | "OFFICE_MATCH_6";
  cellCount: number;
  revealedCells: number[];
  status: "ACTIVE" | "CASHED_OUT" | "BUST" | "COMPLETED";
  payoutCents: number;
};

type OfficeState = {
  wallet: { sessionId: string; balanceCents: number };
  round: OfficeRound | null;
};

type OfficeMutation = {
  outcome: "SAFE" | "BUST" | "COMPLETED" | "CASHED_OUT" | "NOOP";
  state: OfficeState;
};

type OfficeClientInternals = {
  state: OfficeState | null;
  officeRevealQueue: Promise<void>;
  queueOfficeReveal: (cellIndex: number) => Promise<void>;
  applyState: (nextState: OfficeState, animateTerminal?: boolean) => void;
  setFeedback: (value: string) => void;
};

type FinalizeTracker = {
  roundId: string | null;
  committedCells: Set<number>;
  finalizePromise: Promise<void> | null;
};

const API_BASE = "/api/cadi-kazan";
const OFFICE_FINALIZE_TIMEOUT_MS = 2_200;
const installedClients = new WeakSet<object>();

function newFinalizeIdempotencyKey(cellIndex: number) {
  return `office-final-${cellIndex}-${crypto.randomUUID()}-${Date.now()}`;
}

async function revealOfficeCell(roundId: string, cellIndex: number): Promise<OfficeMutation> {
  const response = await fetch(`${API_BASE}/rounds/${encodeURIComponent(roundId)}/reveal`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cellIndex,
      idempotencyKey: newFinalizeIdempotencyKey(cellIndex),
    }),
    signal: AbortSignal.timeout(OFFICE_FINALIZE_TIMEOUT_MS),
  });
  const data = await response.json() as OfficeMutation & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Office sonucu kesinleştirilemedi");
  return data;
}

function bestMutation(mutations: OfficeMutation[]) {
  const terminal = mutations
    .filter((mutation) => mutation.state.round?.status !== "ACTIVE")
    .sort((left, right) =>
      (right.state.round?.revealedCells.length ?? 0) - (left.state.round?.revealedCells.length ?? 0)
    );
  if (terminal[0]) return terminal[0];

  return [...mutations].sort((left, right) =>
    (right.state.round?.revealedCells.length ?? 0) - (left.state.round?.revealedCells.length ?? 0)
  )[0] ?? null;
}

/**
 * The Office keeps its existing scratch thresholds and normal reveal ordering.
 * Only when every cell has already crossed the existing commit gate do we
 * collapse the remaining queued server round-trips so terminal settlement is
 * not visibly delayed after the card is physically finished.
 */
export function installOfficeTerminalFinalizeGuard(client: unknown) {
  if (!client || typeof client !== "object" || installedClients.has(client)) return;
  installedClients.add(client);

  const internal = client as OfficeClientInternals;
  const originalQueueOfficeReveal = internal.queueOfficeReveal.bind(internal);
  const originalApplyState = internal.applyState.bind(internal);
  const tracker: FinalizeTracker = {
    roundId: null,
    committedCells: new Set<number>(),
    finalizePromise: null,
  };

  // Concurrent terminalization can leave one older Office reveal response in
  // flight. Never let an older ACTIVE snapshot downgrade an already terminal
  // authoritative state for the same Office round.
  internal.applyState = (nextState, animateTerminal = false) => {
    const currentRound = internal.state?.round;
    const incomingRound = nextState.round;
    if (
      currentRound?.mode === "OFFICE_MATCH_6" &&
      incomingRound?.mode === "OFFICE_MATCH_6" &&
      currentRound.id === incomingRound.id &&
      currentRound.status !== "ACTIVE" &&
      incomingRound.status === "ACTIVE"
    ) {
      return;
    }

    const instantOfficeTerminal =
      incomingRound?.mode === "OFFICE_MATCH_6" && incomingRound.status !== "ACTIVE";
    originalApplyState(nextState, instantOfficeTerminal ? false : animateTerminal);
  };

  internal.queueOfficeReveal = (cellIndex: number) => {
    const round = internal.state?.round;
    if (!round || round.mode !== "OFFICE_MATCH_6" || round.status !== "ACTIVE") {
      return originalQueueOfficeReveal(cellIndex);
    }

    if (tracker.roundId !== round.id) {
      tracker.roundId = round.id;
      tracker.committedCells.clear();
      tracker.finalizePromise = null;
    }
    tracker.committedCells.add(cellIndex);

    // Nothing changes during normal scratching. The fast path is armed only
    // after all six Office cells have independently passed ScratchSurface's
    // existing coverage/time/distance commit gate.
    if (tracker.committedCells.size < round.cellCount) {
      return originalQueueOfficeReveal(cellIndex);
    }
    if (tracker.finalizePromise) return tracker.finalizePromise;

    const priorQueue = internal.officeRevealQueue;
    const roundId = round.id;
    const committed = [...tracker.committedCells];
    tracker.finalizePromise = (async () => {
      const current = internal.state?.round;
      if (!current || current.id !== roundId || current.status !== "ACTIVE") return;

      const alreadyRevealed = new Set(current.revealedCells);
      const pending = committed.filter((index) => !alreadyRevealed.has(index));
      if (pending.length === 0) return;

      const settled = await Promise.allSettled(
        pending.map((index) => revealOfficeCell(roundId, index)),
      );
      const successful = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const authoritative = bestMutation(successful);

      if (!authoritative?.state.round || authoritative.state.round.id !== roundId) {
        // Preserve the old correctness path if the accelerated terminal request
        // cannot produce an authoritative state.
        await originalQueueOfficeReveal(cellIndex);
        return;
      }

      internal.applyState(authoritative.state, false);

      if (authoritative.state.round.status === "COMPLETED") {
        // Applying terminal state makes queued Office reveals no-op. Wait only
        // for the request that was already in flight, then restore final copy
        // so a stale SAFE response cannot leave the UI saying "Karakter açıldı".
        await priorQueue.catch(() => undefined);
        internal.setFeedback(
          authoritative.state.round.payoutCents > 0
            ? "3 aynı karakter bulundu. Ödül wallet’a aktarıldı."
            : "6 alan tamamlandı. Eşleşme çıkmadı.",
        );
        return;
      }

      // Extremely defensive fallback: if all six committed cells were sent but
      // the server still reports ACTIVE, retain the original serialized path.
      await originalQueueOfficeReveal(cellIndex);
    })().finally(() => {
      tracker.finalizePromise = null;
    });

    return tracker.finalizePromise;
  };
}
