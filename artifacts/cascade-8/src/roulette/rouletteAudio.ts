import {
  type BallMotionPhase,
} from "./ballMotion";
import {
  type RouletteSimulationEvent,
} from "./simulationEvents";

export type RouletteAudioMotion = {
  rotorAngularVelocity: number;
  ballAngularVelocity: number;
  ballPhase: BallMotionPhase;
};

export type RouletteContinuousAudioProfile = {
  rotorGain: number;
  rotorFrequency: number;
  trackGain: number;
  trackFrequency: number;
};

export type RouletteImpactAudioProfile = {
  frequency: number;
  gain: number;
  durationSeconds: number;
  noiseGain: number;
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

export function getContinuousAudioProfile(
  motion: RouletteAudioMotion,
): RouletteContinuousAudioProfile {
  const rotorSpeed = Math.max(
    0,
    motion.rotorAngularVelocity,
  );
  const ballSpeed = Math.max(
    0,
    motion.ballAngularVelocity,
  );
  const trackActive =
    motion.ballPhase === "track";

  const rotorAmount =
    clamp01(rotorSpeed / 7);
  const trackAmount =
    trackActive
      ? clamp01(ballSpeed / 18)
      : 0;

  return {
    rotorGain:
      0.018 +
      rotorAmount * 0.065,
    rotorFrequency:
      46 +
      rotorAmount * 44,
    trackGain:
      trackAmount * 0.11,
    trackFrequency:
      1450 +
      trackAmount * 2450,
  };
}

function getVariant(
  event: RouletteSimulationEvent,
) {
  const seed =
    event.collisionIndex ??
    event.pocketIndex ??
    0;
  return (
    ((seed * 17 + 11) % 7) -
    3
  ) * 0.025;
}

export function getImpactAudioProfile(
  event: RouletteSimulationEvent,
): RouletteImpactAudioProfile | null {
  const intensity =
    clamp01(event.intensity);
  const variation = getVariant(event);

  switch (event.kind) {
    case "deflector-hit":
      return {
        frequency:
          1820 *
          (1 + variation),
        gain:
          0.11 +
          intensity * 0.16,
        durationSeconds: 0.055,
        noiseGain:
          0.055 +
          intensity * 0.045,
      };

    case "fret-hit":
      return {
        frequency:
          1180 *
          (1 + variation),
        gain:
          0.085 +
          intensity * 0.14,
        durationSeconds: 0.043,
        noiseGain:
          0.05 +
          intensity * 0.04,
      };

    case "pocket-bounce":
      return {
        frequency:
          760 *
          (1 + variation),
        gain:
          0.06 +
          intensity * 0.10,
        durationSeconds: 0.052,
        noiseGain:
          0.04 +
          intensity * 0.035,
      };

    case "pocket-capture":
      return {
        frequency:
          520 *
          (1 + variation * 0.5),
        gain:
          0.07 +
          intensity * 0.07,
        durationSeconds: 0.075,
        noiseGain: 0.035,
      };

    case "settled":
      return {
        frequency:
          330 *
          (1 + variation * 0.3),
        gain: 0.20,
        durationSeconds: 0.12,
        noiseGain: 0.09,
      };

    default:
      return null;
  }
}

function createNoiseBuffer(
  ctx: AudioContext,
) {
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(
    1,
    length,
    ctx.sampleRate,
  );
  const channel =
    buffer.getChannelData(0);
  let seed = 0x51f15e;

  for (
    let index = 0;
    index < channel.length;
    index += 1
  ) {
    seed =
      (
        Math.imul(
          seed ^ (seed >>> 15),
          2246822519,
        ) +
        3266489917
      ) >>> 0;

    channel[index] =
      (
        seed /
        0xffffffff
      ) *
        2 -
      1;
  }

  return buffer;
}

export class RouletteAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  private rotorOscillator: OscillatorNode | null = null;
  private rotorGain: GainNode | null = null;

  private trackSource: AudioBufferSourceNode | null = null;
  private trackFilter: BiquadFilterNode | null = null;
  private trackGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;

  private ensureGraph() {
    if (this.ctx) return;

    const ctx = new AudioContext();
    const master = ctx.createGain();
    const compressor =
      ctx.createDynamicsCompressor();

    master.gain.value = 0.78;
    compressor.threshold.value = -15;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;

    master.connect(compressor);
    compressor.connect(
      ctx.destination,
    );

    const rotorOscillator =
      ctx.createOscillator();
    const rotorFilter =
      ctx.createBiquadFilter();
    const rotorGain =
      ctx.createGain();

    rotorOscillator.type = "triangle";
    rotorOscillator.frequency.value = 46;
    rotorFilter.type = "lowpass";
    rotorFilter.frequency.value = 260;
    rotorFilter.Q.value = 0.8;
    rotorGain.gain.value = 0;

    rotorOscillator.connect(
      rotorFilter,
    );
    rotorFilter.connect(rotorGain);
    rotorGain.connect(master);
    rotorOscillator.start();

    const noiseBuffer =
      createNoiseBuffer(ctx);
    const trackSource =
      ctx.createBufferSource();
    const trackFilter =
      ctx.createBiquadFilter();
    const trackGain =
      ctx.createGain();

    trackSource.buffer = noiseBuffer;
    trackSource.loop = true;
    trackFilter.type = "bandpass";
    trackFilter.frequency.value = 2000;
    trackFilter.Q.value = 7.5;
    trackGain.gain.value = 0;

    trackSource.connect(
      trackFilter,
    );
    trackFilter.connect(trackGain);
    trackGain.connect(master);
    trackSource.start();

    this.ctx = ctx;
    this.master = master;
    this.compressor = compressor;
    this.rotorOscillator =
      rotorOscillator;
    this.rotorGain = rotorGain;
    this.trackSource = trackSource;
    this.trackFilter = trackFilter;
    this.trackGain = trackGain;
    this.noiseBuffer = noiseBuffer;
  }

  async ensureStarted() {
    this.ensureGraph();

    if (
      this.ctx &&
      this.ctx.state === "suspended"
    ) {
      await this.ctx.resume();
    }
  }

  updateMotion(
    motion: RouletteAudioMotion,
  ) {
    const ctx = this.ctx;

    if (
      !ctx ||
      ctx.state !== "running" ||
      !this.rotorOscillator ||
      !this.rotorGain ||
      !this.trackFilter ||
      !this.trackGain
    ) {
      return;
    }

    const profile =
      getContinuousAudioProfile(
        motion,
      );
    const now = ctx.currentTime;

    this.rotorOscillator.frequency
      .setTargetAtTime(
        profile.rotorFrequency,
        now,
        0.06,
      );
    this.rotorGain.gain
      .setTargetAtTime(
        motion.rotorAngularVelocity >
          0.01
          ? profile.rotorGain
          : 0,
        now,
        0.08,
      );

    this.trackFilter.frequency
      .setTargetAtTime(
        profile.trackFrequency,
        now,
        0.035,
      );
    this.trackGain.gain
      .setTargetAtTime(
        profile.trackGain,
        now,
        0.045,
      );
  }

  handleEvent(
    event: RouletteSimulationEvent,
  ) {
    const profile =
      getImpactAudioProfile(
        event,
      );

    if (!profile) return;
    this.playImpact(
      event,
      profile,
    );
  }

  stopMotion() {
    if (!this.ctx) return;

    const now =
      this.ctx.currentTime;

    this.rotorGain?.gain
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

  private playImpact(
    event: RouletteSimulationEvent,
    profile: RouletteImpactAudioProfile,
  ) {
    const ctx = this.ctx;
    const master = this.master;
    const noiseBuffer =
      this.noiseBuffer;

    if (
      !ctx ||
      ctx.state !== "running" ||
      !master ||
      !noiseBuffer
    ) {
      return;
    }

    const now = ctx.currentTime;
    const oscillator =
      ctx.createOscillator();
    const toneFilter =
      ctx.createBiquadFilter();
    const toneGain =
      ctx.createGain();

    oscillator.type =
      event.kind ===
      "deflector-hit"
        ? "sine"
        : "triangle";
    oscillator.frequency
      .setValueAtTime(
        profile.frequency,
        now,
      );
    oscillator.frequency
      .exponentialRampToValueAtTime(
        Math.max(
          80,
          profile.frequency *
            0.72,
        ),
        now +
          profile.durationSeconds,
      );

    toneFilter.type = "bandpass";
    toneFilter.frequency.value =
      profile.frequency;
    toneFilter.Q.value =
      event.kind ===
      "settled"
        ? 1.7
        : 4.5;

    toneGain.gain
      .setValueAtTime(
        Math.max(
          0.0001,
          profile.gain,
        ),
        now,
      );
    toneGain.gain
      .exponentialRampToValueAtTime(
        0.0001,
        now +
          profile.durationSeconds,
      );

    oscillator.connect(
      toneFilter,
    );
    toneFilter.connect(toneGain);
    toneGain.connect(master);
    oscillator.start(now);
    oscillator.stop(
      now +
        profile.durationSeconds +
        0.015,
    );

    const noise =
      ctx.createBufferSource();
    const noiseFilter =
      ctx.createBiquadFilter();
    const noiseGain =
      ctx.createGain();

    noise.buffer = noiseBuffer;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value =
      event.kind ===
      "deflector-hit"
        ? 3100
        : event.kind ===
            "settled"
          ? 720
          : 1800;
    noiseFilter.Q.value = 2.2;

    noiseGain.gain
      .setValueAtTime(
        Math.max(
          0.0001,
          profile.noiseGain,
        ),
        now,
      );
    noiseGain.gain
      .exponentialRampToValueAtTime(
        0.0001,
        now +
          Math.min(
            0.07,
            profile.durationSeconds,
          ),
      );

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);

    const variant =
      (
        event.collisionIndex ??
        event.pocketIndex ??
        0
      ) % 8;
    noise.start(
      now,
      variant * 0.071,
      Math.min(
        0.08,
        profile.durationSeconds,
      ),
    );
  }
}
