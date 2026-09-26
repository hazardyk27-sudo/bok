export type ScratchTelemetryRound = {
  roundId: string;
  mode: "STANDARD" | "ADVANCED";
  bombCount: number;
  cellCount: number;
  stakeCents: number;
};

export type ScratchTelemetryPayload = {
  event: "round_start" | "scratch_commit" | "reveal_result" | "settlement";
  at: number;
  round: ScratchTelemetryRound;
  reducedMotion: boolean;
  cellIndex?: number;
  input?: "pointer" | "keyboard";
  outcome?: string;
  revealedSafeCount?: number;
  multiplierBps?: number;
  payoutCents?: number;
};

const reducedMotion = () => typeof window !== "undefined"
  && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

export class ScratchTelemetry {
  private round: ScratchTelemetryRound | null = null;

  beginRound(round: ScratchTelemetryRound) {
    if (this.round?.roundId === round.roundId) return;
    this.round = round;
    this.emit({ event: "round_start", at: Date.now(), round, reducedMotion: reducedMotion() });
  }

  recordScratchCommit(cellIndex: number) {
    if (!this.round) return;
    this.emit({
      event: "scratch_commit",
      at: Date.now(),
      round: this.round,
      reducedMotion: reducedMotion(),
      cellIndex,
      input: "pointer",
    });
  }

  recordRevealRequest(cellIndex: number, input: "pointer" | "keyboard") {
    if (!this.round) return;
    this.emit({
      event: "reveal_result",
      at: Date.now(),
      round: this.round,
      reducedMotion: reducedMotion(),
      cellIndex,
      input,
      outcome: "REQUESTED",
    });
  }

  recordRevealResult(cellIndex: number, outcome: string, revealedSafeCount: number, multiplierBps: number) {
    if (!this.round) return;
    this.emit({
      event: "reveal_result",
      at: Date.now(),
      round: this.round,
      reducedMotion: reducedMotion(),
      cellIndex,
      outcome,
      revealedSafeCount,
      multiplierBps,
    });
  }

  recordSettlement(outcome: string, revealedSafeCount: number, multiplierBps: number, payoutCents: number) {
    if (!this.round) return;
    this.emit({
      event: "settlement",
      at: Date.now(),
      round: this.round,
      reducedMotion: reducedMotion(),
      outcome,
      revealedSafeCount,
      multiplierBps,
      payoutCents,
    });
  }

  private emit(payload: ScratchTelemetryPayload) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("cadi-kazan-telemetry", { detail: payload }));
  }
}