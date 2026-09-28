import {
  type BallMotionPhase,
} from "./ballMotion";
import {
  type RouletteSimulationEvent,
} from "./simulationEvents";

const LOOP_BANK_URL = new URL(
  "./audio/roulette_reference_loops.mp3",
  import.meta.url,
).href;

const HIT_BANK_URL = new URL(
  "./audio/roulette_reference_hits.mp3",
  import.meta.url,
).href;

const LOOP_SLICES = {
  wheel: {
    offset: 0,
    duration: 0.77,
  },
  track: {
    offset: 0.85,
    duration: 0.77,
  },
} as const;

const HIT_SLICES = {
  deflector: {
    offset: 0,
    duration: 0.09,
  },
  fret1: {
    offset: 0.134989,
    duration: 0.07,
  },
  fret2: {
    offset: 0.249977,
    duration: 0.074989,
  },
  pocket1: {
    offset: 0.369955,
    duration: 0.12,
  },
  pocket2: {
    offset: 0.534943,
    duration: 0.08,
  },
  pocket3: {
    offset: 0.659932,
    duration: 0.094989,
  },
  pocket4: {
    offset: 0.799909,
    duration: 0.115011,
  },
  settle: {
    offset: 0.959909,
    duration: 0.145011,
  },
} as const;

export type RouletteAudioMotion = {
  rotorAngularVelocity: number;
  ballAngularVelocity: number;
  ballPhase: BallMotionPhase;
};

export type RouletteReferenceMix = {
  wheelGain: number;
  wheelPlaybackRate: number;
  trackGain: number;
  trackPlaybackRate: number;
};

export type RouletteReferenceHit = {
  offset: number;
  duration: number;
  gain: number;
  playbackRate: number;
};

function clamp01(value: number) {
  return Math.min(
    1,
    Math.max(
      0,
      Number.isFinite(value) ? value : 0,
    ),
  );
}

export function getReferenceMix(
  motion: RouletteAudioMotion,
): RouletteReferenceMix {
  const wheelAmount = clamp01(
    motion.rotorAngularVelocity / 7,
  );
  const ballAmount = clamp01(
    motion.ballAngularVelocity / 18,
  );

  const trackPhaseGain =
    motion.ballPhase === "track"
      ? 1
      : motion.ballPhase === "descent" ||
          motion.ballPhase === "deflector"
        ? 0.52
        : 0;

  return {
    wheelGain:
      wheelAmount > 0.01
        ? 0.055 + wheelAmount * 0.12
        : 0,
    wheelPlaybackRate:
      0.82 + wheelAmount * 0.22,
    trackGain:
      ballAmount *
      trackPhaseGain *
      0.24,
    trackPlaybackRate:
      0.82 + ballAmount * 0.30,
  };
}

function eventVariant(
  event: RouletteSimulationEvent,
) {
  const index =
    event.collisionIndex ??
    event.pocketIndex ??
    0;

  return (
    ((index * 13 + 5) % 7) -
    3
  ) * 0.012;
}

export function getReferenceHit(
  event: RouletteSimulationEvent,
): RouletteReferenceHit | null {
  const intensity = clamp01(
    event.intensity,
  );
  const rateVariation =
    eventVariant(event);

  if (event.kind === "deflector-hit") {
    return {
      ...HIT_SLICES.deflector,
      gain:
        0.22 +
        intensity * 0.28,
      playbackRate:
        1 + rateVariation,
    };
  }

  if (event.kind === "fret-hit") {
    const source =
      (event.collisionIndex ?? 0) %
        2 ===
      0
        ? HIT_SLICES.fret1
        : HIT_SLICES.fret2;

    return {
      ...source,
      gain:
        0.17 +
        intensity * 0.24,
      playbackRate:
        1 + rateVariation,
    };
  }

  if (event.kind === "pocket-bounce") {
    const sources = [
      HIT_SLICES.pocket1,
      HIT_SLICES.pocket2,
      HIT_SLICES.pocket3,
      HIT_SLICES.pocket4,
    ];
    const source =
      sources[
        (event.collisionIndex ?? 0) %
          sources.length
      ];

    return {
      ...source,
      gain:
        0.13 +
        intensity * 0.20,
      playbackRate:
        0.985 +
        rateVariation,
    };
  }

  if (event.kind === "pocket-capture") {
    return {
      ...HIT_SLICES.pocket4,
      gain:
        0.12 +
        intensity * 0.10,
      playbackRate:
        0.94 +
        rateVariation * 0.5,
    };
  }

  if (event.kind === "settled") {
    return {
      ...HIT_SLICES.settle,
      gain: 0.42,
      playbackRate:
        0.98 +
        rateVariation * 0.35,
    };
  }

  return null;
}

async function decodeBank(
  ctx: AudioContext,
  url: string,
) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Roulette audio bank failed: ${response.status}`,
    );
  }

  return ctx.decodeAudioData(
    await response.arrayBuffer(),
  );
}

export class RouletteAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private loopBuffer: AudioBuffer | null = null;
  private hitBuffer: AudioBuffer | null = null;
  private loadPromise: Promise<void> | null = null;

  private wheelSource: AudioBufferSourceNode | null = null;
  private wheelGain: GainNode | null = null;

  private trackSource: AudioBufferSourceNode | null = null;
  private trackGain: GainNode | null = null;

  private ensureGraph() {
    if (this.ctx) return;

    const ctx = new AudioContext();
    const master = ctx.createGain();
    const compressor =
      ctx.createDynamicsCompressor();

    master.gain.value = 0.9;
    compressor.threshold.value = -12;
    compressor.knee.value = 14;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.0025;
    compressor.release.value = 0.17;

    master.connect(compressor);
    compressor.connect(
      ctx.destination,
    );

    this.ctx = ctx;
    this.master = master;
  }

  private async ensureBanks() {
    this.ensureGraph();

    if (
      this.loopBuffer &&
      this.hitBuffer
    ) {
      return;
    }

    if (!this.ctx) return;

    if (!this.loadPromise) {
      this.loadPromise = Promise.all([
        decodeBank(
          this.ctx,
          LOOP_BANK_URL,
        ),
        decodeBank(
          this.ctx,
          HIT_BANK_URL,
        ),
      ])
        .then(
          ([loopBuffer, hitBuffer]) => {
            this.loopBuffer =
              loopBuffer;
            this.hitBuffer =
              hitBuffer;
          },
        )
        .catch((error) => {
          this.loadPromise = null;
          console.warn(
            "Roulette reference audio could not be loaded.",
            error,
          );
        });
    }

    await this.loadPromise;
  }

  async ensureStarted() {
    this.ensureGraph();

    if (
      this.ctx &&
      this.ctx.state ===
        "suspended"
    ) {
      await this.ctx.resume();
    }

    await this.ensureBanks();
    this.ensureLoopSources();
  }

  private ensureLoopSources() {
    const ctx = this.ctx;
    const master = this.master;
    const buffer = this.loopBuffer;

    if (
      !ctx ||
      !master ||
      !buffer
    ) {
      return;
    }

    if (!this.wheelSource) {
      const source =
        ctx.createBufferSource();
      const gain =
        ctx.createGain();

      source.buffer = buffer;
      source.loop = true;
      source.loopStart =
        LOOP_SLICES.wheel.offset;
      source.loopEnd =
        LOOP_SLICES.wheel.offset +
        LOOP_SLICES.wheel.duration;
      source.playbackRate.value =
        0.9;
      gain.gain.value = 0;

      source.connect(gain);
      gain.connect(master);
      source.start(
        0,
        LOOP_SLICES.wheel.offset,
      );

      this.wheelSource = source;
      this.wheelGain = gain;
    }

    if (!this.trackSource) {
      const source =
        ctx.createBufferSource();
      const gain =
        ctx.createGain();

      source.buffer = buffer;
      source.loop = true;
      source.loopStart =
        LOOP_SLICES.track.offset;
      source.loopEnd =
        LOOP_SLICES.track.offset +
        LOOP_SLICES.track.duration;
      source.playbackRate.value =
        1;
      gain.gain.value = 0;

      source.connect(gain);
      gain.connect(master);
      source.start(
        0,
        LOOP_SLICES.track.offset,
      );

      this.trackSource = source;
      this.trackGain = gain;
    }
  }

  updateMotion(
    motion: RouletteAudioMotion,
  ) {
    const ctx = this.ctx;

    if (
      !ctx ||
      ctx.state !== "running"
    ) {
      return;
    }

    this.ensureLoopSources();

    if (
      !this.wheelSource ||
      !this.wheelGain ||
      !this.trackSource ||
      !this.trackGain
    ) {
      return;
    }

    const mix =
      getReferenceMix(motion);
    const now = ctx.currentTime;

    this.wheelSource.playbackRate
      .setTargetAtTime(
        mix.wheelPlaybackRate,
        now,
        0.07,
      );
    this.wheelGain.gain
      .setTargetAtTime(
        mix.wheelGain,
        now,
        0.06,
      );

    this.trackSource.playbackRate
      .setTargetAtTime(
        mix.trackPlaybackRate,
        now,
        0.045,
      );
    this.trackGain.gain
      .setTargetAtTime(
        mix.trackGain,
        now,
        0.035,
      );
  }

  handleEvent(
    event: RouletteSimulationEvent,
  ) {
    const hit =
      getReferenceHit(event);

    if (!hit) return;
    this.playHit(hit);
  }

  stopMotion() {
    const ctx = this.ctx;

    if (!ctx) return;

    const now = ctx.currentTime;

    this.wheelGain?.gain
      .setTargetAtTime(
        0,
        now,
        0.055,
      );
    this.trackGain?.gain
      .setTargetAtTime(
        0,
        now,
        0.035,
      );
  }

  private playHit(
    hit: RouletteReferenceHit,
  ) {
    const ctx = this.ctx;
    const master = this.master;
    const buffer = this.hitBuffer;

    if (
      !ctx ||
      ctx.state !== "running" ||
      !master ||
      !buffer
    ) {
      return;
    }

    const source =
      ctx.createBufferSource();
    const gain =
      ctx.createGain();

    source.buffer = buffer;
    source.playbackRate.value =
      hit.playbackRate;
    gain.gain.value = hit.gain;

    source.connect(gain);
    gain.connect(master);

    source.start(
      ctx.currentTime,
      hit.offset,
      hit.duration,
    );
  }
}
